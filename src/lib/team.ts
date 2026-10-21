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
