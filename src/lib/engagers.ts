import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/**
 * Post engagement: counts on each post, and the people who reacted, commented
 * or reposted. The dashboard asks for a collection ("Collect engagers"); the
 * extension, on LinkedIn, opens the post and reads the people; they appear here
 * and can be sent to People Search. Row Level Security: own client only.
 */
export type EngagerKind = 'reaction' | 'comment' | 'repost';
export type EngagersStatus = 'none' | 'requested' | 'collecting' | 'done' | 'failed';

export interface Engager {
  id: number;
  post_id: string;
  kind: EngagerKind;
  reaction_type: string | null;
  linkedin_url: string;
  full_name: string | null;
  headline: string | null;
  comment_text: string | null;
  collected_at: string;
  sent_at: string | null;
}

export const REACTION_EMOJI: Record<string, string> = {
  like: '👍',
  celebrate: '👏',
  support: '🤝',
  love: '❤️',
  insightful: '💡',
  funny: '😄',
  curious: '🤔',
};

export const KIND_LABEL: Record<EngagerKind, string> = {
  comment: 'Commented',
  reaction: 'Reacted',
  repost: 'Reposted',
};

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };
function notConfigured<T>(): Result<T> {
  return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
}

/** True when the database does not have the engagement columns yet (SQL not run). */
export function isMissingColumn(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  return err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist/i.test(err.message ?? '');
}

export async function loadEngagers(postId: string): Promise<Result<Engager[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_post_engagers')
    .select('id, post_id, kind, reaction_type, linkedin_url, full_name, headline, comment_text, collected_at, sent_at')
    .eq('post_id', postId)
    .order('kind', { ascending: true })
    .order('id', { ascending: true })
    .range(0, 1999);
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data ?? []) as Engager[], error: null };
}

/** "Collect engagers": the extension picks the request up on LinkedIn. */
export async function requestEngagers(postId: string): Promise<FriendlyError | null> {
  if (!supabase) return { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };
  const { error } = await supabase.from('gab_posts').update({ engagers_status: 'requested' }).eq('id', postId);
  return error ? toFriendlyError(error) : null;
}

export async function cancelEngagersRequest(postId: string): Promise<FriendlyError | null> {
  if (!supabase) return { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };
  const { error } = await supabase
    .from('gab_posts')
    .update({ engagers_status: 'none' })
    .eq('id', postId)
    .eq('engagers_status', 'requested');
  return error ? toFriendlyError(error) : null;
}

/** Copies people into the member's People Search list. Returns how many were new there. */
export async function sendToPeopleSearch(ids: number[], queue: boolean): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  if (!ids.length) return { data: 0, error: null };
  let added = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.rpc('gab_engagers_to_search', { p_ids: ids.slice(i, i + 500), p_queue: queue });
    if (error) return { data: null, error: toFriendlyError(error) };
    added += Number(data) || 0;
  }
  return { data: added, error: null };
}

export async function deleteEngagers(ids: number[]): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  if (!ids.length) return { data: 0, error: null };
  const { data, error } = await supabase.from('gab_post_engagers').delete().in('id', ids).select('id');
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: data?.length ?? 0, error: null };
}

// ---------------------------------------------------------------------------
// Pause between posts while the extension collects (per member)
// ---------------------------------------------------------------------------
export type EngagersPace = 'careful' | 'normal' | 'fast';
export const PACES: Array<{ key: EngagersPace; label: string; range: string; hint: string }> = [
  { key: 'careful', label: 'Careful', range: '45–120 s', hint: 'Safest for your LinkedIn account' },
  { key: 'normal', label: 'Normal', range: '15–35 s', hint: 'Recommended' },
  { key: 'fast', label: 'Fast', range: '8–15 s', hint: 'Quicker, a little more risk' },
];

export async function loadEngagersPace(userId: string): Promise<Result<EngagersPace>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.from('gab_comment_settings').select('engagers_pace').eq('user_id', userId).maybeSingle();
  if (error) return { data: null, error: toFriendlyError(error) };
  const v = (data as { engagers_pace?: string } | null)?.engagers_pace;
  return { data: v === 'careful' || v === 'fast' ? v : 'normal', error: null };
}

export async function saveEngagersPace(userId: string, clientId: string | null, pace: EngagersPace): Promise<Result<true>> {
  if (!supabase) return notConfigured();
  const { data: existing, error: readError } = await supabase
    .from('gab_comment_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return { data: null, error: toFriendlyError(readError) };
  const row = { engagers_pace: pace, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('gab_comment_settings').update(row).eq('user_id', userId)
    : await supabase.from('gab_comment_settings').insert({ user_id: userId, client_id: clientId, ...row });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: true, error: null };
}
