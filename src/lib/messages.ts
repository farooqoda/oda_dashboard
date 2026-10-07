import { DRAFT_CHAT_WEBHOOK } from './constants';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';
import type { SendStatus } from './types';

/**
 * Message Sender writes: everything goes straight to Supabase (Row Level
 * Security limits it to this user's client). n8n only writes chat messages
 * the user asked for; the GAB extension sends what the user queued.
 */

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };

function notConfigured<T>(): Result<T> {
  return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
}

async function updateLeads(
  ids: number[],
  column: 'send_status' | 'chat_status',
  from: string[],
  patch: Record<string, unknown>,
): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  if (ids.length === 0) return { data: 0, error: null };
  const { data, error } = await supabase
    .from('gab_leads')
    .update(patch)
    .in('id', ids)
    .in(column, from)
    .select('id');
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: data?.length ?? 0, error: null };
}

const QUEUEABLE: SendStatus[] = ['none', 'failed', 'skipped'];

/** Hand leads to the extension. Texts must already be saved. */
export function queueLeads(ids: number[], userId: string) {
  return updateLeads(ids, 'send_status', QUEUEABLE, {
    send_status: 'queued',
    send_owner: userId,
    send_queued_at: new Date().toISOString(),
    send_error: null,
  });
}

export function cancelQueuedLeads(ids: number[]) {
  return updateLeads(ids, 'send_status', ['queued'], { send_status: 'none', send_queued_at: null });
}

/** Ask the AI for a (new) chat message for these leads. */
export function requestChatMessages(ids: number[], userId: string) {
  return updateLeads(ids, 'chat_status', ['none', 'drafted'], {
    chat_status: 'draft_requested',
    chat_owner: userId,
    chat_error: null,
  });
}

export interface ChatRunResult {
  drafted: number;
  failed: number;
  remaining: number;
}

/** One call to the chat-message writer (it handles up to 8 leads per call). */
export async function runChatBatch(userId: string): Promise<Result<ChatRunResult>> {
  let response: Response;
  try {
    response = await fetch(DRAFT_CHAT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
  } catch (cause) {
    return {
      data: null,
      error: {
        message: 'The message writer could not be reached.',
        hint: `Check your connection and try again. Details: ${cause instanceof Error ? cause.message : String(cause)}`,
        code: 'DRAFT_CHAT',
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
        message: `The message writer returned an error${response.ok ? '' : ` (${response.status})`}.`,
        hint: raw ? `Details: ${raw.slice(0, 300)}` : null,
        code: 'DRAFT_CHAT',
      },
    };
  }
  return {
    data: { drafted: Number(r.drafted) || 0, failed: Number(r.failed) || 0, remaining: Number(r.remaining) || 0 },
    error: null,
  };
}

/** The signed-in user's daily invite limit (shared by manual and automatic invites). */
export async function loadInviteQuota(userId: string): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('gab_users').select('daily_quota').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  const q = Number((data as { daily_quota?: unknown }).daily_quota);
  return Number.isFinite(q) && q > 0 ? q : null;
}

export async function loadChatPrompt(userId: string): Promise<Result<string>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_comment_settings')
    .select('chat_prompt')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: ((data as { chat_prompt?: string | null } | null)?.chat_prompt ?? '') || '', error: null };
}

/** Insert-or-update by hand (users may not update user_id, so no upsert). */
export async function saveChatPrompt(userId: string, clientId: string | null, prompt: string): Promise<Result<true>> {
  if (!supabase) return notConfigured();
  const { data: existing, error: readError } = await supabase
    .from('gab_comment_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return { data: null, error: toFriendlyError(readError) };
  const fields = { chat_prompt: prompt, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('gab_comment_settings').update(fields).eq('user_id', userId)
    : await supabase.from('gab_comment_settings').insert({ user_id: userId, client_id: clientId, ...fields });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: true, error: null };
}
