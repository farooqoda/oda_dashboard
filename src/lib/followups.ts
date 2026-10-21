import { FOLLOWUPS_WEBHOOK } from './constants';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';
import type { Lead } from './types';

/**
 * Batch B (extension v4.25): follow-ups and AI reply drafts.
 *  - n8n writes a follow-up when one is due (default 4 days after the first message, then 7 more)
 *    and a reply draft when the extension finds someone wrote back.
 *  - The member approves (or edits / skips / rewrites) here; approved texts go into the same send
 *    queue as first messages, with send_kind 'followup' / 'reply', and the extension writes them in
 *    the existing LinkedIn conversation.
 * Everything is a plain update on the member's own leads (Row Level Security).
 */

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };
const notConfigured = <T,>(): Result<T> => ({ data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } });

/** Follow-ups tab: drafted, being written, queued or failed — for people who have not replied. */
export function isFollowupItem(l: Lead): boolean {
  if (l.reply_detected_at) return false;
  if (l.send_kind === 'followup') return true;
  return ['drafting', 'drafted', 'failed', 'redraft'].includes(l.followup_status ?? 'none');
}

/** Replies tab: someone wrote back and the answer is not sent yet. */
export function isReplyItem(l: Lead): boolean {
  if (!l.reply_detected_at || !(l.reply_snippet ?? '').trim()) return false;
  if (l.send_kind === 'reply') return true;
  return ['none', 'drafting', 'drafted', 'failed', 'redraft'].includes(l.reply_draft_status ?? 'none');
}

/** The first message's queue tab must not show follow-ups or replies. */
export const isFirstMessage = (l: Lead) => !l.send_kind;

export function followupLabel(l: Lead, total = 2): string {
  const step = (l.followup_step ?? 0) + 1;
  return `Follow-up ${Math.min(step, Math.max(total, 1))}`;
}

async function update(ids: number[], patch: Record<string, unknown>, filter: (q: any) => any): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  if (ids.length === 0) return { data: 0, error: null };
  const { data, error } = await filter(supabase.from('gab_leads').update({ ...patch, updated_at: new Date().toISOString() }).in('id', ids)).select('id');
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data as unknown[] | null)?.length ?? 0, error: null };
}

/** Approve (and save the edited text): the extension sends it in the existing conversation. */
export async function approveFollowup(lead: Lead, text: string, userId: string) {
  return update([lead.id], {
    followup_draft: text,
    followup_status: 'queued',
    followup_error: null,
    send_status: 'queued',
    send_kind: 'followup',
    send_owner: userId,
    send_queued_at: new Date().toISOString(),
  }, (q) => q.in('followup_status', ['drafted', 'failed']).not('send_status', 'in', '(queued,sending)').is('reply_detected_at', null));
}

export function saveFollowupText(lead: Lead, text: string) {
  return update([lead.id], { followup_draft: text }, (q) => q.in('followup_status', ['drafted', 'failed']));
}

/** No more follow-ups for this person. */
export function stopFollowups(ids: number[]) {
  return update(ids, { followup_status: 'stopped' }, (q) => q.in('followup_status', ['drafted', 'failed', 'none', 'sent', 'redraft']).not('send_status', 'in', '(queued,sending)'));
}

/** Ask the AI for a new version (it is written within 10 minutes, or at once with draftNow). */
export function rewriteFollowup(ids: number[]) {
  return update(ids, { followup_status: 'redraft', followup_error: null }, (q) => q.in('followup_status', ['drafted', 'failed']).not('send_status', 'in', '(queued,sending)'));
}

/** Take a queued follow-up back out of the queue (it waits for approval again). */
export function unqueueFollowup(ids: number[]) {
  return update(ids, { send_status: 'sent', send_kind: null, followup_status: 'drafted', send_queued_at: null }, (q) => q.eq('send_status', 'queued').eq('send_kind', 'followup'));
}

export async function approveReply(lead: Lead, text: string, userId: string) {
  return update([lead.id], {
    reply_draft: text,
    reply_draft_status: 'queued',
    send_status: 'queued',
    send_kind: 'reply',
    send_owner: userId,
    send_queued_at: new Date().toISOString(),
    send_error: null,
  }, (q) => q.in('reply_draft_status', ['drafted', 'failed']).not('send_status', 'in', '(queued,sending)'));
}

export function saveReplyText(lead: Lead, text: string) {
  return update([lead.id], { reply_draft: text }, (q) => q.in('reply_draft_status', ['drafted', 'failed']));
}

export function rewriteReply(ids: number[]) {
  return update(ids, { reply_draft_status: 'redraft' }, (q) => q.in('reply_draft_status', ['drafted', 'failed', 'none']).not('send_status', 'in', '(queued,sending)'));
}

/** You answered on LinkedIn yourself: take it off the list. */
export function replyHandled(ids: number[]) {
  return update(ids, { reply_draft_status: 'sent' }, (q) => q.in('reply_draft_status', ['none', 'drafted', 'failed', 'redraft']).not('send_status', 'in', '(queued,sending)'));
}

export function unqueueReply(ids: number[]) {
  return update(ids, { send_status: 'sent', send_kind: null, reply_draft_status: 'drafted', send_queued_at: null }, (q) => q.eq('send_status', 'queued').eq('send_kind', 'reply'));
}

export interface DraftNowResult {
  followups: number;
  replies: number;
  failed: number;
}

/** Write this member's due follow-ups and reply drafts now (otherwise every 10 minutes). */
export async function draftNow(userId: string): Promise<Result<DraftNowResult>> {
  let response: Response;
  try {
    response = await fetch(FOLLOWUPS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
  } catch (cause) {
    return {
      data: null,
      error: {
        message: 'The follow-up writer could not be reached.',
        hint: `Check your connection and try again. Details: ${cause instanceof Error ? cause.message : String(cause)}`,
        code: 'FOLLOWUPS',
      },
    };
  }
  const raw = await response.text().catch(() => '');
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    body = null;
  }
  const r = (Array.isArray(body) ? body[0] : body) as Record<string, unknown> | null;
  if (!response.ok || !r || r.ok !== true) {
    return {
      data: null,
      error: {
        message: `The follow-up writer returned an error${response.ok ? '' : ` (${response.status})`}.`,
        hint: raw ? `Details: ${raw.slice(0, 300)}` : 'Is the "ODA GAB - Follow-ups & Reply Drafts" workflow active in n8n?',
        code: 'FOLLOWUPS',
      },
    };
  }
  return { data: { followups: Number(r.followups) || 0, replies: Number(r.replies) || 0, failed: Number(r.failed) || 0 }, error: null };
}
