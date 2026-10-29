import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/** Platform admins only: every customer with plan, status, last login and extension last seen. */
export interface Customer {
  email: string;
  client_id: string | null;
  client_name: string | null;
  plan: string | null;
  billing_period: string | null;
  status: string | null;
  expiry_date: string | null;
  source: 'stripe' | 'manual' | 'dashboard only';
  signed_up_at: string | null;
  has_dashboard: boolean;
  dashboard_since: string | null;
  last_login_at: string | null;
  ext_seen_at: string | null;
  ext_version: string | null;
  autopilot_on: boolean;
  key_hint: string | null;
  on_trial: boolean;
}

export interface SignupEvent {
  id: number;
  client_id: string | null;
  email: string | null;
  plan: string | null;
  event: string;
  detail: string | null;
  seen: boolean;
  created_at: string;
}

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };
const notConfigured: FriendlyError = { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };

export async function loadCustomers(): Promise<Result<Customer[]>> {
  if (!supabase) return { data: null, error: notConfigured };
  const { data, error } = await supabase.rpc('gab_customers_list');
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data as Customer[]) ?? [], error: null };
}

export async function loadSignupFeed(limit = 50): Promise<Result<SignupEvent[]>> {
  if (!supabase) return { data: null, error: notConfigured };
  const { data, error } = await supabase.rpc('gab_signup_feed', { p_limit: limit });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data as SignupEvent[]) ?? [], error: null };
}

export async function markSignupsSeen(ids: number[]): Promise<FriendlyError | null> {
  if (!supabase) return notConfigured;
  if (!ids.length) return null;
  const { error } = await supabase.rpc('gab_signup_mark_seen', { p_ids: ids });
  return error ? toFriendlyError(error) : null;
}

/** What to call the customer's state right now. Trial = Stripe signup still inside its first period. */
export function customerState(c: Customer, today = new Date()): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' } {
  if (c.source === 'dashboard only') return { label: 'No licence', tone: 'muted' };
  const s = (c.status ?? '').toLowerCase();
  const exp = c.expiry_date ? new Date(c.expiry_date + 'T23:59:59') : null;
  if (s === 'canceled' || s === 'cancelled') return { label: 'Cancelled', tone: 'bad' };
  if (s === 'past_due') return { label: 'Payment failed', tone: 'bad' };
  if (exp && exp < today) return { label: 'Expired', tone: 'bad' };
  if (s !== 'active') return { label: s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown', tone: 'warn' };
  if (c.on_trial) return { label: 'Free trial', tone: 'warn' };
  return { label: c.source === 'stripe' ? 'Paying' : 'Active', tone: 'good' };
}

export function daysLeft(c: Customer, today = new Date()): number | null {
  if (!c.expiry_date) return null;
  const exp = new Date(c.expiry_date + 'T00:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((exp.getTime() - t.getTime()) / 86400000);
}
