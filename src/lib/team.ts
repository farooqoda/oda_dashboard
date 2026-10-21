import { useEffect, useState } from 'react';
import { useAuth } from '../data/AuthProvider';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/** Batch C: the manager view. Only members listed in gab_team_managers get rows back. */
export interface TeamMember {
  user_id: string;
  email: string | null;
  license_status: string | null;
  expiry_date: string | null;
  daily_quota: number | null;
  invites_today: number;
  invites: number;
  messages: number;
  followups: number;
  replies: number;
  accepted: number;
  replies_sent: number;
  queued: number;
  failed: number;
  to_approve: number;
  leads: number;
  safety_paused_until: string | null;
  last_warning_at: string | null;
  inbox_checked_at: string | null;
  ext_seen_at: string | null;
  ext_version: string | null;
  ext_auto: { ms?: boolean; bl?: boolean; eg?: boolean } | null;
  last_activity_at: string | null;
}

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };

export async function loadTeam(days: number): Promise<Result<TeamMember[]>> {
  if (!supabase) return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
  const { data, error } = await supabase.rpc('gab_team_overview', { p_days: days });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data as TeamMember[]) ?? [], error: null };
}

/** true when the signed-in member is a manager (false before the Batch C database step). */
export function useIsManager(): boolean {
  const { user } = useAuth();
  const [manager, setManager] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!supabase || !user) {
      setManager(false);
      return;
    }
    void supabase.rpc('gab_am_manager').then(({ data, error }) => {
      if (!cancelled) setManager(!error && data === true);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);
  return manager;
}

// ---------------------------------------------------------------------------
// Batch C2: platform admin (every client) + client managers (their clients), any date range
// ---------------------------------------------------------------------------
export interface ActivityRow {
  client_id: string;
  user_id: string;
  email: string | null;
  license_status: string | null;
  expiry_date: string | null;
  daily_quota: number | null;
  profiles: number;
  searched: number;
  posts: number;
  engagers: number;
  comments: number;
  invites: number;
  messages: number;
  followups: number;
  accepted: number;
  replies: number;
  replies_sent: number;
  queued: number;
  failed: number;
  to_approve: number;
  safety_paused_until: string | null;
  ext_seen_at: string | null;
  ext_version: string | null;
  ext_auto: { ms?: boolean; bl?: boolean; eg?: boolean } | null;
  last_activity_at: string | null;
}

export interface DailyRow {
  day: string;
  invites: number;
  messages: number;
  followups: number;
  replies: number;
  comments: number;
  profiles: number;
}

export interface ReportClient {
  client_id: string;
  members: number;
}

const notConfigured = { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };

/** null data + missing: the Batch C2 database step has not been run (fall back to the 7-day view). */
export async function loadReportClients(): Promise<Result<ReportClient[]> & { missing?: boolean }> {
  if (!supabase) return { data: null, error: notConfigured };
  const { data, error } = await supabase.rpc('gab_report_clients');
  if (error) return { data: null, error: toFriendlyError(error), missing: error.code === 'PGRST202' || /gab_report_clients/.test(error.message) };
  return { data: (data as ReportClient[]) ?? [], error: null };
}

export async function loadActivity(from: string, to: string, client: string | null, tz: string): Promise<Result<ActivityRow[]>> {
  if (!supabase) return { data: null, error: notConfigured };
  const { data, error } = await supabase.rpc('gab_team_activity', { p_from: from, p_to: to, p_client: client, p_tz: tz });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data as ActivityRow[]) ?? [], error: null };
}

export async function loadDaily(from: string, to: string, client: string | null, tz: string): Promise<Result<DailyRow[]>> {
  if (!supabase) return { data: null, error: notConfigured };
  const { data, error } = await supabase.rpc('gab_team_daily', { p_from: from, p_to: to, p_client: client, p_tz: tz });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data as DailyRow[]) ?? [], error: null };
}

export async function amPlatformAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('gab_is_platform_admin');
  return !error && data === true;
}

/**
 * Minutes a person would spend doing each thing by hand (open the profile, read, write, send…).
 * An estimate, shown as such on the page.
 */
export const MINUTES_BY_HAND: Partial<Record<keyof ActivityRow, number>> = {
  profiles: 3,
  searched: 1,
  posts: 1,
  engagers: 0.5,
  comments: 4,
  invites: 2,
  messages: 3,
  followups: 3,
  replies_sent: 4,
};

export function minutesSaved(r: Partial<Record<keyof ActivityRow, unknown>>): number {
  let m = 0;
  for (const [k, per] of Object.entries(MINUTES_BY_HAND)) m += (Number(r[k as keyof ActivityRow]) || 0) * (per ?? 0);
  return m;
}
