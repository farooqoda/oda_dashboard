import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';
import { isMissingColumn } from './engagers';

/**
 * Batch A (extension v4.24): per-member automation settings, stored in the
 * member's own gab_comment_settings row (Row Level Security: own row only).
 *  - working hours: runs that start by themselves (⚡) only start/continue inside them
 *  - warm-up: a new LinkedIn account sends fewer invites a day at first
 *  - safety pause: set by the extension when LinkedIn shows a warning
 *  - inbox check: when the extension last read the inbox and connections
 */
export interface AutomationSettings {
  schedule_on: boolean;
  work_days: number[]; // 1 = Monday … 7 = Sunday
  work_start: string; // "HH:MM"
  work_end: string;
  work_tz: string;
  warmup_on: boolean;
  warmup_started_on: string | null;
  safety_paused_until: string | null;
  last_warning_at: string | null;
  last_warning_text: string | null;
  inbox_checked_at: string | null;
  inbox_last_result: { replies?: number; accepted?: number; conversations?: number; connections?: number } | null;
}

export const DEFAULT_AUTOMATION: AutomationSettings = {
  schedule_on: false,
  work_days: [1, 2, 3, 4, 5],
  work_start: '09:00',
  work_end: '18:00',
  work_tz: guessTimeZone(),
  warmup_on: false,
  warmup_started_on: null,
  safety_paused_until: null,
  last_warning_at: null,
  last_warning_text: null,
  inbox_checked_at: null,
  inbox_last_result: null,
};

export function guessTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto';
  } catch {
    return 'America/Toronto';
  }
}

export const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const COLUMNS =
  'schedule_on, work_days, work_start, work_end, work_tz, warmup_on, warmup_started_on, safety_paused_until, last_warning_at, last_warning_text, inbox_checked_at, inbox_last_result';

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };

/** null data + missing=true: the Batch A database step has not been run yet. */
export async function loadAutomation(userId: string): Promise<Result<AutomationSettings> & { missing?: boolean }> {
  if (!supabase) return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
  const { data, error } = await supabase.from('gab_comment_settings').select(COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return { data: null, error: toFriendlyError(error), missing: true };
    return { data: null, error: toFriendlyError(error) };
  }
  if (!data) return { data: { ...DEFAULT_AUTOMATION }, error: null };
  const row = data as Record<string, unknown>;
  const hhmm = (v: unknown, d: string) => (typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : d);
  return {
    data: {
      ...DEFAULT_AUTOMATION,
      ...(row as Partial<AutomationSettings>),
      work_days: Array.isArray(row.work_days) ? (row.work_days as unknown[]).map(Number) : DEFAULT_AUTOMATION.work_days,
      work_start: hhmm(row.work_start, '09:00'),
      work_end: hhmm(row.work_end, '18:00'),
      work_tz: typeof row.work_tz === 'string' && row.work_tz ? row.work_tz : DEFAULT_AUTOMATION.work_tz,
    },
    error: null,
  };
}

export type AutomationPatch = Partial<
  Pick<AutomationSettings, 'schedule_on' | 'work_days' | 'work_start' | 'work_end' | 'work_tz' | 'warmup_on' | 'safety_paused_until'>
>;

export async function saveAutomation(userId: string, clientId: string | null, patch: AutomationPatch): Promise<FriendlyError | null> {
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

export function isPaused(s: AutomationSettings | null): boolean {
  return !!(s && s.safety_paused_until && new Date(s.safety_paused_until).getTime() > Date.now());
}

/** The member's warm-up limit today (same steps as the server): 8 → 12 → 16 → normal. */
export function warmupLimit(startedOn: string | null, normal: number): number {
  if (!startedOn) return Math.min(8, normal);
  const days = Math.floor((Date.now() - new Date(startedOn + 'T00:00:00').getTime()) / 86400000);
  const step = days < 7 ? 8 : days < 14 ? 12 : days < 21 ? 16 : normal;
  return Math.min(step, normal);
}

/** All IANA time zones the browser knows (fallback: a short list). */
export function timeZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn('timeZone');
  } catch {
    /* older browser */
  }
  return ['America/Toronto', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Asia/Karachi', 'Asia/Dubai', 'UTC'];
}
