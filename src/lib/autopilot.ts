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
  /** Phase 2 (SQL h2): comma-separated words in the headline to keep / to skip. */
  ap_headline_include: string;
  ap_headline_exclude: string;
  /** Phase 3 (SQL h2): queue the best ready warm leads as invites by itself. Off by default. */
  ap_auto_queue: boolean;
  ap_auto_min_fit: number;
  ap_auto_per_run: number;
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
  ap_headline_include: '',
  ap_headline_exclude: '',
  ap_auto_queue: false,
  ap_auto_min_fit: 70,
  ap_auto_per_run: 10,
};

/** Allowed ranges (the database refuses anything outside them). */
export const AP_LIMITS = {
  ap_min_engagement: [0, 100000],
  ap_max_age_days: [1, 30],
  ap_posts_per_signal: [1, 10],
  ap_leads_per_run: [5, 100],
  ap_sync_per_run: [0, 20],
  ap_every_hours: [1, 24],
  ap_auto_min_fit: [40, 100],
  ap_auto_per_run: [1, 50],
} as const;

const SETTINGS_COLUMNS =
  'ap_on, ap_min_engagement, ap_max_age_days, ap_who, ap_posts_per_signal, ap_leads_per_run, ap_sync_per_run, ap_every_hours, ap_last_run_at, comment_pace, message_pace, sync_pace';

const PHASE2_COLUMNS = ', ap_headline_include, ap_headline_exclude, ap_auto_queue, ap_auto_min_fit, ap_auto_per_run';
/** False when SQL h2 has not been run yet: the page then hides the phase 2/3 controls. */
export let hasPhase2 = true;

export async function loadAutopilotSettings(userId: string): Promise<Result<AutopilotSettings>> {
  if (!supabase) return notConfigured();
  let res = await supabase.from('gab_comment_settings').select(SETTINGS_COLUMNS + (hasPhase2 ? PHASE2_COLUMNS : '')).eq('user_id', userId).maybeSingle();
  if (res.error && hasPhase2 && isMissingColumn(res.error)) {
    hasPhase2 = false;
    res = await supabase.from('gab_comment_settings').select(SETTINGS_COLUMNS).eq('user_id', userId).maybeSingle();
  }
  if (res.error) return { data: null, error: toFriendlyError(res.error) };
  return { data: { ...AP_DEFAULTS, ...((res.data as Partial<AutopilotSettings> | null) ?? {}) }, error: null };
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

// ---------------------------------------------------------------------------
// Phase 2 (SQL h2): the people with their lead once synced — fit, note, send status
// ---------------------------------------------------------------------------
export interface WarmLead {
  search_lead_id: number;
  linkedin_url: string;
  full_name: string | null;
  headline: string | null;
  status: AutopilotLead['status'];
  error: string | null;
  engagement_kind: AutopilotLead['engagement_kind'];
  engagement_text: string | null;
  engagement_author: string | null;
  signal_id: number | null;
  created_at: string;
  lead_id: number | null;
  fit: number | null;
  invite_message: string | null;
  send_status: string | null;
  connection_status: string | null;
  /** Synced, has a note, not queued or sent yet. */
  ready: boolean;
}

function fromOldRow(l: AutopilotLead): WarmLead {
  return {
    search_lead_id: l.id, linkedin_url: l.linkedin_url, full_name: l.full_name, headline: l.headline, status: l.status, error: l.error,
    engagement_kind: l.engagement_kind, engagement_text: l.engagement_text, engagement_author: l.engagement_author,
    signal_id: l.autopilot_signal_id, created_at: l.created_at, lead_id: null, fit: null, invite_message: null,
    send_status: null, connection_status: null, ready: false,
  };
}

/** The latest people Autopilot found. Uses the phase 2 function when it exists. */
export async function loadWarmLeads(limit = 100): Promise<Result<WarmLead[]>> {
  if (!supabase) return notConfigured();
  if (hasPhase2) {
    const { data, error } = await supabase.rpc('gab_ap_warm_leads', { p_limit: limit });
    if (!error) {
      return {
        data: ((data ?? []) as WarmLead[]).map((r) => ({ ...r, fit: r.fit === null || r.fit === undefined ? null : Number(r.fit) })),
        error: null,
      };
    }
    if (!isMissingAutopilot(error)) return { data: null, error: toFriendlyError(error) };
    hasPhase2 = false;
  }
  const old = await loadAutopilotLeads(limit);
  if (old.error) return { data: null, error: old.error };
  return { data: old.data.map(fromOldRow), error: null };
}

/** How many warm leads wait for approval (Today, the bell). 0 when phase 2 is not set up. */
let readyCache: { at: number; value: number } | null = null;
let readyInFlight: Promise<number> | null = null;
export const AP_READY_CHANGED = 'gab-ap-ready-changed';
export function loadReadyCount(force = false): Promise<number> {
  const client = supabase;
  if (!client || !hasPhase2) return Promise.resolve(0);
  if (!force && readyCache && Date.now() - readyCache.at < 60000) return Promise.resolve(readyCache.value);
  if (readyInFlight) return readyInFlight;
  readyInFlight = (async () => {
    const { data, error } = await client.rpc('gab_ap_ready_count_me');
    if (error && isMissingAutopilot(error)) hasPhase2 = false;
    const value = error ? 0 : Number(data) || 0;
    readyCache = { at: Date.now(), value };
    return value;
  })().finally(() => {
    readyInFlight = null;
  });
  return readyInFlight;
}
export function forgetReadyCount() {
  readyCache = null;
  window.dispatchEvent(new Event(AP_READY_CHANGED));
}

// ---------------------------------------------------------------------------
// H3: Run now + what Autopilot is doing (extension 4.33)
// ---------------------------------------------------------------------------
export interface AutopilotStatus {
  on: boolean;
  signals: number;
  status: 'waiting' | 'running' | 'done' | 'failed' | 'error' | null;
  detail: string | null;
  status_at: string | null;
  last_run_at: string | null;
  next_due_at: string | null;
  run_now_pending: boolean;
  run_now_at: string | null;
  ext_seen_at: string | null;
  ext_version: string | null;
  paused_until: string | null;
  schedule_on: boolean;
  work_days: number[] | null;
  work_start: string | null;
  work_end: string | null;
  work_tz: string | null;
}

/** null data + missing = the H3 SQL has not been run yet (the page then hides the status card). */
export async function loadAutopilotStatus(): Promise<{ data: AutopilotStatus | null; missing: boolean }> {
  if (!supabase) return { data: null, missing: true };
  const { data, error } = await supabase.rpc('gab_ap_status_me');
  if (error) return { data: null, missing: true };
  return { data: (data as AutopilotStatus) ?? null, missing: false };
}

export async function requestRunNow(): Promise<{ ok: boolean; reason?: string }> {
  if (!supabase) return { ok: false, reason: 'not_configured' };
  const { data, error } = await supabase.rpc('gab_ap_run_now');
  if (error) return { ok: false, reason: error.message };
  return (data as { ok: boolean; reason?: string }) ?? { ok: false };
}

/** What the extension last said, in plain words. */
export function statusText(s: Pick<AutopilotStatus, 'status' | 'detail'>): { text: string; tone: 'good' | 'warn' | 'bad' | 'info' } {
  const d = s.detail ?? '';
  switch (s.status) {
    case 'running':
      return { text: `Running now: looking at “${d}”.`, tone: 'info' };
    case 'done':
      return { text: `Last run finished: ${d}.`, tone: 'good' };
    case 'failed':
      return {
        text:
          d === 'warning'
            ? 'Last run stopped: LinkedIn showed a security check. Automatic runs pause for 24 hours.'
            : d === 'timeout'
              ? 'Last run took too long and was stopped (was the computer asleep?).'
              : d === 'interrupted'
                ? 'Last run did not finish (Chrome was closed, the computer went off, or the extension updated). What it found is kept; the next run starts by itself.'
              : `Last run stopped (${d}).`,
        tone: 'bad',
      };
    case 'error':
      return { text: `The extension could not reach the server (${d}). It tries again in 5 minutes.`, tone: 'bad' };
    case 'waiting': {
      const why: Record<string, string> = {
        off: 'Autopilot is switched off.',
        no_signals: 'No active keyword or creator yet.',
        outside_hours: 'Outside your working hours — it waits until they start (Run now still works).',
        paused: 'Paused for 24 hours after a LinkedIn warning.',
        busy: 'Another task is running on LinkedIn (sending, comments or syncing) — it waits until that finishes.',
        nothing_due: 'Waiting: every signal was checked recently. The next one is due at the time shown.',
        plan: 'Autopilot is not included in the Starter plan.',
      };
      return { text: why[d] ?? `Waiting (${d}).`, tone: d === 'nothing_due' ? 'good' : 'warn' };
    }
    default:
      return { text: 'The extension has not reported yet. Open LinkedIn in Chrome (extension 4.33 or newer).', tone: 'warn' };
  }
}
