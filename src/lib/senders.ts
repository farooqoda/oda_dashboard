import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/** One LinkedIn account (one member) and how safe it is to keep sending from it. */
export type Health = 'risk' | 'watch' | 'offline' | 'good';

export interface Sender {
  client_id: string;
  user_id: string;
  email: string | null;
  invite_limit: number;
  invites_today: number;
  daily_quota: number;
  warmup_on: boolean;
  warmup_day: number | null;
  invites_7d: number;
  invites_30d: number;
  accepted_30d: number;
  replies_30d: number;
  acceptance_30d: number | null;
  pending: number;
  pending_old: number;
  failed_7d: number;
  queued: number;
  last_warning_at: string | null;
  last_warning_text: string | null;
  safety_paused_until: string | null;
  ext_seen_at: string | null;
  ext_version: string | null;
  last_sent_at: string | null;
  health: Health;
  reasons: string[] | null;
}

export interface Reason {
  level: Health | 'info';
  text: string;
}

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };
const notConfigured: FriendlyError = { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };

export async function loadSenders(client: string | null): Promise<Result<Sender[]> & { missing?: boolean }> {
  if (!supabase) return { data: null, error: notConfigured };
  const { data, error } = await supabase.rpc('gab_sender_health', { p_client: client });
  if (error) return { data: null, error: toFriendlyError(error), missing: error.code === 'PGRST202' || /gab_sender_health/.test(error.message) };
  return { data: (data as Sender[]) ?? [], error: null };
}

/** The server sends reasons as "level:text". */
export function reasonsOf(s: Sender): Reason[] {
  return (s.reasons ?? []).map((r) => {
    const i = r.indexOf(':');
    const level = r.slice(0, i) as Reason['level'];
    return { level: ['risk', 'watch', 'offline', 'info'].includes(level) ? level : 'info', text: r.slice(i + 1) };
  });
}

export const HEALTH_LABEL: Record<Health, string> = {
  risk: 'At risk',
  watch: 'Watch',
  offline: 'Offline',
  good: 'Healthy',
};
