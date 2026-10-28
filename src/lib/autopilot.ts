import { isMissingColumn } from './engagers';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/**
 * Warm Lead Autopilot (batch H1). The member follows keywords and creators;
 * while LinkedIn is open the extension finds recent posts for them, collects the
 * people on the best posts, and queues the new ones in People Search for a sync
 * (fit score + personal note). Nothing is sent without the member's approval.
 * Also here: the safe pace each member picks for comments, messages and syncs.
 */
type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };
function notConfigured<T>(): Result<T> {
  return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
}
/** The batch H1 SQL has not been run yet. */
export function isMissingAutopilot(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!err) return false;
  return (
    isMissingColumn(err) ||
    err.code === '42P01' ||
    err.code === 'PGRST202' ||
    err.code === 'PGRST205' ||
    /gab_autopilot_signals|gab_ap_|does not exist|could not find/i.test(err.message ?? '')
  );
}

// ---------------------------------------------------------------------------
// Settings (gab_comment_settings, own row)
// ---------------------------------------------------------------------------
export type Pace = 'careful' | 'normal' | 'fast';
export type ApWho = 'all' | 'commenters';

export interface AutopilotSettings {
  ap_on: boolean;
  ap_min_engagement: number;
  ap_max_age_days: number;
  ap_who: ApWho;
  ap_posts_per_signal: number;
  ap_leads_per_run: number;
  ap_sync_per_run: number;
  ap_every_hours: number;
  ap_last_run_at: string | null;
  comment_pace: Pace;
  message_pace: Pace;
  sync_pace: Pace;
}
export type AutopilotPatch = Partial<Omit<AutopilotSettings, 'ap_last_run_at'>>;

export const AP_DEFAULTS: AutopilotSettings = {
  ap_on: false,
  ap_min_engagement: 20,
  ap_max_age_days: 7,
  ap_who: 'all',
  ap_posts_per_signal: 3,
  ap_leads_per_run: 25,
  ap_sync_per_run: 5,
  ap_every_hours: 4,
  ap_last_run_at: null,
  comment_pace: 'careful',
  message_pace: 'careful',
  sync_pace: 'careful',
};

/** Allowed ranges (the database refuses anything outside them). */
export const AP_LIMITS = {
  ap_min_engagement: [0, 100000],
  ap_max_age_days: [1, 30],
  ap_posts_per_signal: [1, 10],
  ap_leads_per_run: [5, 100],
  ap_sync_per_run: [0, 20],
  ap_every_hours: [1, 24],
} as const;

const SETTINGS_COLUMNS =
  'ap_on, ap_min_engagement, ap_max_age_days, ap_who, ap_posts_per_signal, ap_leads_per_run, ap_sync_per_run, ap_every_hours, ap_last_run_at, comment_pace, message_pace, sync_pace';

export async function loadAutopilotSettings(userId: string): Promise<Result<AutopilotSettings>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.from('gab_comment_settings').select(SETTINGS_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: { ...AP_DEFAULTS, ...((data as Partial<AutopilotSettings> | null) ?? {}) }, error: null };
}

export async function saveAutopilotSettings(userId: string, clientId: string | null, patch: AutopilotPatch): Promise<FriendlyError | null> {
  if (!supabase) return { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };
  const { data: existing, error: readError } = await supabase
    .from('gab_comment_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return toFriendlyError(readError);
  const row = { ...patch, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('gab_comment_settings').update(row).eq('user_id', userId)
    : await supabase.from('gab_comment_settings').insert({ user_id: userId, client_id: clientId, ...row });
  return error ? toFriendlyError(error) : null;
}

// ---------------------------------------------------------------------------
// Pace per task (same ranges as the extension)
// ---------------------------------------------------------------------------
export type PaceTask = 'comment' | 'message' | 'sync';
export const TASK_PACES: Record<PaceTask, Record<Pace, string>> = {
  comment: { careful: '45–120 s', normal: '30–90 s', fast: '20–60 s' },
  message: { careful: '45–120 s', normal: '30–90 s', fast: '20–60 s' },
  sync: { careful: '60–150 s', normal: '40–100 s', fast: '25–60 s' },
};
export const PACE_LABELS: Record<Pace, { label: string; hint: string }> = {
  careful: { label: 'Careful', hint: 'Safest for your LinkedIn account (default)' },
  normal: { label: 'Normal', hint: 'A little quicker' },
  fast: { label: 'Fast', hint: 'Quickest, more risk' },
};

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------
export type SignalKind = 'keyword' | 'creator';
export interface Signal {
  id: number;
  kind: SignalKind;
  value: string;
  label: string | null;
  active: boolean;
  last_run_at: string | null;
  last_posts: number | null;
  last_error: string | null;
  total_posts: number;
  total_leads: number;
  created_at: string;
}
export interface SignalStats {
  signal_id: number;
  posts: number;
  people: number;
  leads: number;
  synced: number;
}

export async function loadSignals(): Promise<Result<Signal[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_autopilot_signals')
    .select('id, kind, value, label, active, last_run_at, last_posts, last_error, total_posts, total_leads, created_at')
    .order('created_at', { ascending: true });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data ?? []) as Signal[], error: null };
}

export async function loadSignalStats(): Promise<Result<SignalStats[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.rpc('gab_ap_stats');
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data ?? []) as SignalStats[], error: null };
}

export async function addSignal(kind: SignalKind, value: string, label: string): Promise<Result<number>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.rpc('gab_ap_add_signal', { p_kind: kind, p_value: value, p_label: label || null });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: Number(data), error: null };
}

export async function setSignalActive(id: number, active: boolean): Promise<FriendlyError | null> {
  if (!supabase) return { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };
  const { error } = await supabase.from('gab_autopilot_signals').update({ active }).eq('id', id);
  return error ? toFriendlyError(error) : null;
}

export async function deleteSignal(id: number): Promise<FriendlyError | null> {
  if (!supabase) return { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };
  const { error } = await supabase.from('gab_autopilot_signals').delete().eq('id', id);
  return error ? toFriendlyError(error) : null;
}

/** What a signal looks like in the list: the words, or the profile's name from its link. */
export function signalTitle(s: Pick<Signal, 'kind' | 'value' | 'label'>): string {
  if (s.label) return s.label;
  if (s.kind === 'keyword') return s.value;
  const m = s.value.match(/linkedin\.com\/(in|company)\/([^/]+)/i);
  if (!m) return s.value;
  let slug = m[2];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep it as written */
  }
  // "maya-chen-1a2b3c" -> "Maya Chen"
  return slug
    .replace(/-[0-9a-f]{6,}$/i, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// The people Autopilot found (People Search rows it queued)
// ---------------------------------------------------------------------------
export interface AutopilotLead {
  id: number;
  linkedin_url: string;
  full_name: string | null;
  headline: string | null;
  status: 'new' | 'queued' | 'scraping' | 'done' | 'failed' | 'skipped';
  error: string | null;
  engagement_kind: 'comment' | 'reaction' | 'repost' | null;
  engagement_text: string | null;
  engagement_author: string | null;
  autopilot_signal_id: number | null;
  created_at: string;
  done_at: string | null;
}

export async function loadAutopilotLeads(limit = 100): Promise<Result<AutopilotLead[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_search_leads')
    .select('id, linkedin_url, full_name, headline, status, error, engagement_kind, engagement_text, engagement_author, autopilot_signal_id, created_at, done_at')
    .not('autopilot_signal_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data ?? []) as AutopilotLead[], error: null };
}
