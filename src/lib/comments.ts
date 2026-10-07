import { DRAFT_COMMENTS_WEBHOOK, MAX_ROWS } from './constants';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';
import type { CommentPost, CommentSettings, CommentStatus } from './types';

/**
 * Everything the Comments page writes goes straight to Supabase, where Row
 * Level Security limits it to this user's client. n8n is only asked to "go"
 * (draft what this user marked); the browser extension posts what this user
 * queued.
 */

export const COMMENT_POST_COLUMNS =
  'id, client_id, user_id, post_url, author_name, author_linkedin_url, author_title, post_text, post_posted_at, scraped_at, ' +
  'ai_comment_draft, comment_status, comment_posted_at, comment_owner, comment_force, comment_skip_reason, comment_language, ' +
  'comment_error, comment_generated_at, comment_queued_at, comment_attempts';

/** Languages offered for comments. "auto" = whatever language the post is in. */
export const COMMENT_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Same language as the post' },
  ...[
    'English', 'Urdu', 'Arabic', 'Hindi', 'Bengali', 'Punjabi', 'Persian', 'Turkish', 'French', 'Spanish',
    'Portuguese', 'German', 'Italian', 'Dutch', 'Polish', 'Romanian', 'Greek', 'Swedish', 'Norwegian',
    'Danish', 'Finnish', 'Russian', 'Ukrainian', 'Hebrew', 'Chinese (Simplified)', 'Chinese (Traditional)',
    'Japanese', 'Korean', 'Indonesian', 'Malay', 'Vietnamese', 'Thai', 'Tagalog', 'Swahili',
  ].map((l) => ({ value: l, label: l })),
];

export const DEFAULT_DAILY_LIMIT = 20;

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };

function notConfigured<T>(): Result<T> {
  return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
}

export function hasPostLink(post: Pick<CommentPost, 'post_url'>): boolean {
  return /^https:\/\//i.test(post.post_url || '');
}

export async function loadCommentPosts(): Promise<Result<CommentPost[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_posts')
    .select(COMMENT_POST_COLUMNS)
    .order('scraped_at', { ascending: false })
    .limit(MAX_ROWS);
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data ?? []) as unknown as CommentPost[], error: null };
}

/** Moves the given posts (only those currently in one of `from`) to a new state. */
async function setStatus(
  ids: string[],
  from: CommentStatus[],
  patch: Record<string, unknown>,
): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  if (ids.length === 0) return { data: 0, error: null };
  const { data, error } = await supabase
    .from('gab_posts')
    .update(patch)
    .in('id', ids)
    .in('comment_status', from)
    .select('id');
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: data?.length ?? 0, error: null };
}

/** "Generate comments for all new posts": every post that has never been drafted. */
export async function requestDraftsForAllNew(userId: string): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_posts')
    .update({ comment_status: 'draft_requested', comment_owner: userId, comment_force: false, comment_error: null })
    .eq('comment_status', 'pending')
    .select('id');
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: data?.length ?? 0, error: null };
}

/**
 * Ask for a (new) draft for specific posts. `force` = the user has seen the
 * post and wants a comment even if the AI would skip it.
 */
export function requestDrafts(ids: string[], userId: string, force: boolean) {
  return setStatus(ids, ['pending', 'drafted', 'skipped', 'failed'], {
    comment_status: 'draft_requested',
    comment_owner: userId,
    comment_force: force,
    comment_error: null,
  });
}

export function saveDraftText(id: string, text: string) {
  return setStatus([id], ['drafted', 'failed'], { ai_comment_draft: text });
}

/** Approve: store the final text and hand the post to the extension. */
export async function queueComments(
  items: Array<{ id: string; text: string }>,
  userId: string,
): Promise<Result<number>> {
  let queued = 0;
  for (const item of items) {
    const res = await setStatus([item.id], ['drafted', 'failed'], {
      ai_comment_draft: item.text,
      comment_status: 'queued',
      comment_owner: userId,
      comment_queued_at: new Date().toISOString(),
      comment_error: null,
    });
    if (res.error) return res;
    queued += res.data;
  }
  return { data: queued, error: null };
}

export function cancelQueued(ids: string[]) {
  return setStatus(ids, ['queued'], { comment_status: 'drafted', comment_queued_at: null });
}

export function dismissPosts(ids: string[]) {
  return setStatus(ids, ['pending', 'drafted', 'failed'], {
    comment_status: 'skipped',
    comment_skip_reason: 'Dismissed by you',
  });
}

export interface DraftRunResult {
  drafted: number;
  skipped: number;
  failed: number;
  remaining: number;
}

/** One call to the drafting workflow (it drafts up to 8 posts per call). */
export async function runDraftBatch(userId: string): Promise<Result<DraftRunResult>> {
  let response: Response;
  try {
    response = await fetch(DRAFT_COMMENTS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
  } catch (cause) {
    return {
      data: null,
      error: {
        message: 'The comment writer could not be reached.',
        hint: `Check your connection and try again. Details: ${cause instanceof Error ? cause.message : String(cause)}`,
        code: 'DRAFT_COMMENTS',
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
        message: `The comment writer returned an error${response.ok ? '' : ` (${response.status})`}.`,
        hint: raw ? `Details: ${raw.slice(0, 300)}` : null,
        code: 'DRAFT_COMMENTS',
      },
    };
  }
  return {
    data: {
      drafted: Number(r.drafted) || 0,
      skipped: Number(r.skipped) || 0,
      failed: Number(r.failed) || 0,
      remaining: Number(r.remaining) || 0,
    },
    error: null,
  };
}

export async function loadCommentSettings(userId: string): Promise<Result<CommentSettings | null>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_comment_settings')
    .select('user_id, comment_prompt, comment_language, daily_limit')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data as CommentSettings | null) ?? null, error: null };
}

/**
 * Insert-or-update by hand: an upsert would also try to write user_id, which
 * users are (deliberately) not allowed to update.
 */
export async function saveCommentSettings(
  userId: string,
  clientId: string | null,
  prompt: string,
  language: string,
): Promise<Result<true>> {
  if (!supabase) return notConfigured();
  const existing = await loadCommentSettings(userId);
  if (existing.error) return existing;
  const fields = { comment_prompt: prompt, comment_language: language, updated_at: new Date().toISOString() };
  const { error } = existing.data
    ? await supabase.from('gab_comment_settings').update(fields).eq('user_id', userId)
    : await supabase.from('gab_comment_settings').insert({ user_id: userId, client_id: clientId, ...fields });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: true, error: null };
}
