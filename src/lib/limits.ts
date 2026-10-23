import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/** Batch C5: daily limits are set by the admin / team manager, not by the member. */
export interface MemberLimit {
  user_id: string;
  client_id: string;
  email: string | null;
  invite_quota: number;
  invites_today: number;
  comment_limit: number;
  tz: string;
}
export interface MyLimits {
  invite_quota: number;
  invite_limit_today: number;
  invites_today: number;
  comment_limit: number;
  tz: string;
  day_starts_at: string;
}

export const INVITE_RANGE = [1, 100] as const;
export const COMMENT_RANGE = [1, 50] as const;

type Result<T> = { data: T; error: null; missing?: false } | { data: null; error: FriendlyError | null; missing?: boolean };
const notConfigured = (): Result<never> => ({ data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } });
/** The database step (batch_c5) has not been run yet. */
const isMissing = (e: { code?: string; message?: string }) => e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? '');

export async function loadMemberLimits(): Promise<Result<MemberLimit[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.rpc('gab_member_limits');
  if (error) return isMissing(error) ? { data: null, error: null, missing: true } : { data: null, error: toFriendlyError(error) };
  return { data: (data as MemberLimit[]) ?? [], error: null };
}

export async function saveMemberLimits(userId: string, invites: number, comments: number): Promise<FriendlyError | null> {
  if (!supabase) return notConfigured().error;
  const { error } = await supabase.rpc('gab_set_member_limits', { p_user: userId, p_invites: invites, p_comments: comments });
  if (!error) return null;
  // the database's own message is already written for people ("Invites a day: 1 to 100", …)
  return { message: error.message, hint: null, code: error.code ?? null };
}

export async function loadMyLimits(): Promise<Result<MyLimits | null>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.rpc('gab_my_limits');
  if (error) return isMissing(error) ? { data: null, error: null, missing: true } : { data: null, error: toFriendlyError(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { data: (row as MyLimits) ?? null, error: null };
}

export function validLimit(v: string, [lo, hi]: readonly [number, number]): number | null {
  if (!/^\d+$/.test(v.trim())) return null;
  const n = Number(v);
  return n >= lo && n <= hi ? n : null;
}

/** "12:00 am" in the member's own zone, e.g. "midnight (Asia/Karachi)". */
export function resetText(tz: string): string {
  return `midnight, ${tz.replace(/_/g, ' ')} time`;
}
