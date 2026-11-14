import { BILLING_PORTAL_WEBHOOK } from './constants';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/**
 * Batch P: the member's own plan, and the way to Stripe's Customer Portal (cancel, change card, invoices).
 * The dashboard never sees a Stripe id or key: it asks the database for a one-time ticket for the signed-in
 * member, and n8n turns that ticket into a portal link for that member's own subscription.
 */
export interface Billing {
  plan: string | null;
  billing_period: string | null;
  status: string | null;
  expiry_date: string | null;
  signed_up_at: string | null;
  has_subscription: boolean;
}

const cfgErr = (): FriendlyError => ({ message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' });
const isMissing = (e: { code?: string; message?: string }) =>
  ['PGRST202', '42883'].includes(e.code ?? '') || /could not find the function/i.test(e.message ?? '');

/** null data + missing = the Batch P database step has not been run (the card then stays hidden). */
export async function loadBilling(): Promise<{ data: Billing | null; missing: boolean; error: FriendlyError | null }> {
  if (!supabase) return { data: null, missing: false, error: cfgErr() };
  const { data, error } = await supabase.rpc('ic_my_billing');
  if (error) {
    const missing = isMissing(error);
    return { data: null, missing, error: missing ? null : toFriendlyError(error) };
  }
  if (!data) return { data: null, missing: false, error: null };
  const b = data as Partial<Billing>;
  return {
    data: {
      plan: b.plan ?? null,
      billing_period: b.billing_period ?? null,
      status: b.status ?? null,
      expiry_date: b.expiry_date ?? null,
      signed_up_at: b.signed_up_at ?? null,
      has_subscription: !!b.has_subscription,
    },
    missing: false,
    error: null,
  };
}

/** A trial is "active" in the database until its end date; it is recognised by an end date within ~15 days of signing up. */
export function isTrial(b: Billing): boolean {
  if (!b.signed_up_at || !b.expiry_date) return false;
  const start = new Date(b.signed_up_at).getTime();
  const end = new Date(b.expiry_date + 'T23:59:59Z').getTime();
  return end >= Date.now() - 86400000 && end - start <= 15 * 86400000;
}

export function planLabel(b: Billing): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const plan = b.plan ? cap(b.plan) : 'Impact Connect';
  const period = b.billing_period === 'annual' ? 'yearly' : b.billing_period === 'monthly' ? 'monthly' : '';
  return period ? `${plan} · ${period}` : plan;
}

export function statusLabel(b: Billing): { text: string; tone: 'ok' | 'warn' | 'off' } {
  const s = (b.status ?? '').toLowerCase();
  if (s === 'canceled' || s === 'cancelled') return { text: 'Cancelled', tone: 'off' };
  if (s === 'past_due') return { text: 'Payment problem', tone: 'warn' };
  if (s === 'expired' || s === 'inactive' || s === 'suspended') return { text: 'Not active', tone: 'off' };
  return { text: isTrial(b) ? 'Free trial' : 'Active', tone: 'ok' };
}

/** Asks for a one-time ticket, then for the portal link. Returns the link to open, or a plain-words error. */
export async function openBillingPortal(): Promise<{ url: string | null; error: FriendlyError | null }> {
  if (!supabase) return { url: null, error: cfgErr() };
  const { data: ticket, error } = await supabase.rpc('ic_billing_ticket');
  if (error || typeof ticket !== 'string') {
    if (error && /no_subscription/.test(error.message ?? '')) {
      return {
        url: null,
        error: { message: 'This account has no subscription of its own.', hint: 'If your plan is part of a team, the person who pays for it can manage it.', code: 'NO_SUBSCRIPTION' },
      };
    }
    return { url: null, error: error ? toFriendlyError(error) : { message: 'Could not start.', hint: null, code: null } };
  }
  let res: Response;
  try {
    res = await fetch(BILLING_PORTAL_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
  } catch (cause) {
    return {
      url: null,
      error: { message: 'The billing page could not be reached.', hint: `Check your connection and try again. Details: ${cause instanceof Error ? cause.message : String(cause)}`, code: 'BILLING' },
    };
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean; url?: string; message?: string; error?: string } | null;
  if (body?.ok && typeof body.url === 'string' && /^https:\/\//.test(body.url)) return { url: body.url, error: null };
  return {
    url: null,
    error: { message: body?.message ?? `The billing page did not open (HTTP ${res.status}).`, hint: 'Please try again. If it keeps happening, contact support.', code: body?.error ?? 'BILLING' },
  };
}
