import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/**
 * People collected from LinkedIn people searches by the extension (Lead Scraper task).
 * The user picks who to sync here; the extension then opens each picked profile and
 * syncs it like "Sync Full Lead". Row Level Security: each user sees only their own.
 */
export type SearchLeadStatus = 'new' | 'queued' | 'scraping' | 'done' | 'failed' | 'skipped';

export interface SearchLead {
  id: number;
  linkedin_url: string;
  full_name: string | null;
  headline: string | null;
  location: string | null;
  degree: string | null;
  search_url: string | null;
  search_label: string | null;
  status: SearchLeadStatus;
  error: string | null;
  attempts: number;
  queued_at: string | null;
  claimed_at: string | null;
  done_at: string | null;
  created_at: string;
}

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };
function notConfigured<T>(): Result<T> {
  return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
}

const COLUMNS =
  'id, linkedin_url, full_name, headline, location, degree, search_url, search_label, status, error, attempts, queued_at, claimed_at, done_at, created_at';
export const MAX_ROWS = 3000;

export async function loadSearchLeads(): Promise<Result<SearchLead[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_search_leads')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(0, MAX_ROWS - 1);
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data ?? []) as SearchLead[], error: null };
}

/** Which moves the dashboard may make (the database enforces the same). */
export const MOVES: Record<'queued' | 'new' | 'skipped', SearchLeadStatus[]> = {
  queued: ['new', 'failed', 'skipped'],
  new: ['queued', 'skipped'],
  skipped: ['new', 'queued', 'failed'],
};

export async function moveSearchLeads(ids: number[], to: keyof typeof MOVES): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  if (!ids.length) return { data: 0, error: null };
  let changed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('gab_search_leads')
      .update({ status: to })
      .in('id', ids.slice(i, i + 200))
      .in('status', MOVES[to])
      .select('id');
    if (error) return { data: null, error: toFriendlyError(error) };
    changed += (data ?? []).length;
  }
  return { data: changed, error: null };
}

export async function deleteSearchLeads(ids: number[]): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  let changed = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('gab_search_leads')
      .delete()
      .in('id', ids.slice(i, i + 200))
      .neq('status', 'scraping')
      .select('id');
    if (error) return { data: null, error: toFriendlyError(error) };
    changed += (data ?? []).length;
  }
  return { data: changed, error: null };
}

export const DAILY_LIMIT_OPTIONS = [20, 40, 60, 80, 100, 150] as const;
export const DEFAULT_DAILY_LIMIT = 60;

export async function loadBulkDailyLimit(userId: string): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.from('gab_comment_settings').select('bulk_daily_limit').eq('user_id', userId).maybeSingle();
  if (error) return { data: null, error: toFriendlyError(error) };
  const v = Number((data as { bulk_daily_limit?: number } | null)?.bulk_daily_limit);
  return { data: Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_LIMIT, error: null };
}

export async function saveBulkDailyLimit(userId: string, clientId: string | null, limit: number): Promise<Result<true>> {
  if (!supabase) return notConfigured();
  const { data: existing, error: readError } = await supabase
    .from('gab_comment_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return { data: null, error: toFriendlyError(readError) };
  const row = { bulk_daily_limit: limit, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('gab_comment_settings').update(row).eq('user_id', userId)
    : await supabase.from('gab_comment_settings').insert({ user_id: userId, client_id: clientId, ...row });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: true, error: null };
}

/** https://www.linkedin.com/in/<slug>/ -> slug, to match people with existing leads. */
export function profileKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return m[1].toLowerCase();
  }
}
