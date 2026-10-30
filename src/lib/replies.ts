import { REPLIES_WEBHOOK } from './constants';
import { isMissingColumn } from './engagers';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/**
 * Comment replies (SQL k1). The extension finds new comments on the member's own posts and
 * replies to the member's comments, the AI drafts a reply (n8n "ODA GAB - Comment Replies"),
 * the member approves here, and the Comment Assistant posts it on LinkedIn — inside the same
 * daily / hourly comment limits as comments.
 */

export type ReplySource = 'own_post' | 'my_comment' | 'conversation';
export type ReplyStatus = 'new' | 'drafting' | 'drafted' | 'queued' | 'posting' | 'posted' | 'failed' | 'skipped';

export interface CommentReply {
  id: string;
  source: ReplySource;
  post_url: string;
  post_author: string | null;
  post_text: string | null;
  comment_url: string | null;
  author_name: string | null;
  author_url: string | null;
  author_headline: string | null;
  comment_text: string | null;
  my_comment_text: string | null;
  status: ReplyStatus;
  draft: string | null;
  language: string | null;
  skip_reason: string | null;
  error: string | null;
  lead_added: boolean;
  created_at: string;
  posted_at: string | null;
}

export interface ReplySettings {
  rp_on: boolean;
  rp_own_posts: boolean;
  rp_my_comments: boolean;
  rp_auto_send: boolean;
  rp_add_leads: boolean;
  rp_every_hours: number;
  rp_post_days: number;
  rp_max_per_check: number;
  rp_prompt: string | null;
  rp_skip_words: string | null;
  rp_language: string;
  rp_last_check_at: string | null;
}

export const REPLY_DEFAULTS: ReplySettings = {
  rp_on: false,
  rp_own_posts: true,
  rp_my_comments: true,
  rp_auto_send: false,
  rp_add_leads: true,
  rp_every_hours: 3,
  rp_post_days: 14,
  rp_max_per_check: 10,
  rp_prompt: null,
  rp_skip_words: null,
  rp_language: 'auto',
  rp_last_check_at: null,
};

export const REPLY_CHAR_LIMIT = 1250;
export const REPLY_PROMPT_LIMIT = 1500;
export const SKIP_WORDS_LIMIT = 300;

export const SOURCE_LABEL: Record<ReplySource, string> = {
  own_post: 'On your post',
  my_comment: 'Reply to your comment',
  conversation: 'From Conversations',
};

const COLUMNS =
  'id, source, post_url, post_author, post_text, comment_url, author_name, author_url, author_headline, comment_text, ' +
  'my_comment_text, status, draft, language, skip_reason, error, lead_added, created_at, posted_at';
const SETTING_COLUMNS =
  'rp_on, rp_own_posts, rp_my_comments, rp_auto_send, rp_add_leads, rp_every_hours, rp_post_days, rp_max_per_check, ' +
  'rp_prompt, rp_skip_words, rp_language, rp_last_check_at';

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };
function notConfigured<T>(): Result<T> {
  return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
}
const NOT_INSTALLED: FriendlyError = {
  message: 'Comment replies are not switched on for your workspace yet.',
  hint: 'Ask your admin to run the k1 SQL (comment replies) in Supabase.',
  code: 'RP_MISSING',
};
function missing(err: { code?: string | null; message?: string | null }): boolean {
  return isMissingColumn(err) || err.code === '42P01' || err.code === 'PGRST202' || err.code === 'PGRST205';
}
function friendly(err: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }): FriendlyError {
  return missing(err) ? NOT_INSTALLED : toFriendlyError(err as never);
}

export async function loadReplies(): Promise<Result<CommentReply[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.from('gab_comment_replies').select(COLUMNS).order('created_at', { ascending: false }).limit(500);
  if (error) return { data: null, error: friendly(error) };
  return { data: (data ?? []) as unknown as CommentReply[], error: null };
}

export async function loadReplySettings(userId: string): Promise<Result<ReplySettings>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.from('gab_comment_settings').select(SETTING_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) return { data: null, error: friendly(error) };
  const row = (data ?? {}) as Partial<ReplySettings>;
  const out = { ...REPLY_DEFAULTS };
  for (const k of Object.keys(REPLY_DEFAULTS) as Array<keyof ReplySettings>) {
    if (row[k] !== undefined && row[k] !== null) (out as Record<string, unknown>)[k] = row[k];
  }
  return { data: out, error: null };
}

/** Insert-or-update by hand (users may not write user_id on update). */
export async function saveReplySettings(userId: string, clientId: string | null, s: ReplySettings): Promise<Result<true>> {
  if (!supabase) return notConfigured();
  const fields = {
    rp_on: s.rp_on,
    rp_own_posts: s.rp_own_posts,
    rp_my_comments: s.rp_my_comments,
    rp_auto_send: s.rp_auto_send,
    rp_add_leads: s.rp_add_leads,
    rp_every_hours: Math.min(24, Math.max(1, Math.round(s.rp_every_hours))),
    rp_post_days: Math.min(60, Math.max(1, Math.round(s.rp_post_days))),
    rp_max_per_check: Math.min(30, Math.max(1, Math.round(s.rp_max_per_check))),
    rp_prompt: s.rp_prompt?.trim() ? s.rp_prompt.trim().slice(0, REPLY_PROMPT_LIMIT) : null,
    rp_skip_words: s.rp_skip_words?.trim() ? s.rp_skip_words.trim().slice(0, SKIP_WORDS_LIMIT) : null,
    rp_language: s.rp_language || 'auto',
  };
  const existing = await supabase.from('gab_comment_settings').select('user_id').eq('user_id', userId).maybeSingle();
  if (existing.error) return { data: null, error: friendly(existing.error) };
  const { error } = existing.data
    ? await supabase.from('gab_comment_settings').update(fields).eq('user_id', userId)
    : await supabase.from('gab_comment_settings').insert({ user_id: userId, client_id: clientId, ...fields });
  if (error) return { data: null, error: friendly(error) };
  return { data: true, error: null };
}

export type ReplyAction = 'approve' | 'save' | 'skip' | 'redraft' | 'unqueue';
export async function replyAction(ids: string[], action: ReplyAction, text?: string): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  if (!ids.length) return { data: 0, error: null };
  const { data, error } = await supabase.rpc('gab_rp_action', { p_ids: ids, p_action: action, p_text: text ?? null });
  if (error) return { data: null, error: friendly(error) };
  return { data: Number(data) || 0, error: null };
}

/** Conversations: reply to one collected comment. Returns the new reply's id. */
export async function replyFromEngager(engagerId: number): Promise<Result<string>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.rpc('gab_rp_from_engager', { p_engager: engagerId });
  if (error) return { data: null, error: friendly(error) };
  return { data: String(data), error: null };
}

/** Ask the AI to write the replies that are waiting (answers at once; drafts appear in a few seconds). */
export async function writeReplyDrafts(userId: string): Promise<FriendlyError | null> {
  try {
    const res = await fetch(REPLIES_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'draft', user_id: userId }),
    });
    const raw = await res.text().catch(() => '');
    let r: Record<string, unknown> | null = null;
    try {
      const j = JSON.parse(raw);
      r = (Array.isArray(j) ? j[0] : j) as Record<string, unknown>;
    } catch {
      r = null;
    }
    if (!res.ok || !r || r.ok !== true) {
      return {
        message: 'The reply writer could not start.',
        hint: res.status === 404 ? 'Ask your admin to import and switch on the "ODA GAB - Comment Replies" workflow in n8n.' : 'Try again in a minute.',
        code: 'RP_DRAFT',
      };
    }
    return null;
  } catch (cause) {
    return {
      message: 'The reply writer could not be reached.',
      hint: `Check your connection and try again. Details: ${cause instanceof Error ? cause.message : String(cause)}`,
      code: 'RP_DRAFT',
    };
  }
}

/** "Look for new comments now": the next check on LinkedIn runs at once. */
export async function checkRepliesNow(): Promise<Result<boolean>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.rpc('gab_rp_check_now');
  if (error) return { data: null, error: friendly(error) };
  try {
    window.postMessage({ source: 'gab-dashboard', type: 'rp-kick' }, window.location.origin);
  } catch {
    /* ignore */
  }
  return { data: Boolean((data as { ok?: boolean } | null)?.ok), error: null };
}

export interface ReplyCounts {
  to_review: number;
  drafting: number;
  queued: number;
  posted_today: number;
  failed: number;
}
export const REPLIES_CHANGED = 'gab-replies-changed';
let cache: { at: number; value: ReplyCounts | null } | null = null;
let installed = true;
export async function loadReplyCounts(force = false): Promise<ReplyCounts | null> {
  if (!supabase || !installed) return null;
  if (!force && cache && Date.now() - cache.at < 60000) return cache.value;
  const { data, error } = await supabase.rpc('gab_rp_counts_me');
  if (error && missing(error)) installed = false;
  const value = error ? null : (data as ReplyCounts);
  cache = { at: Date.now(), value };
  return value;
}
export function repliesChanged() {
  cache = null;
  window.dispatchEvent(new Event(REPLIES_CHANGED));
}
