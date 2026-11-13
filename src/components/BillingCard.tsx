import { useEffect, useState } from 'react';
import { isTrial, loadBilling, openBillingPortal, planLabel, statusLabel, type Billing } from '../lib/billing';
import { SUPPORT_EMAIL } from '../lib/constants';
import type { FriendlyError } from '../lib/supabase';
import { Card, InlineError } from './ui';

const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Settings → Billing: the member's plan and a button to Stripe's own page, where they can cancel, change their
 * card or download invoices. Hidden until the Batch P database step has been run.
 */
export function BillingCard() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const back = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('billing') === 'back';

  useEffect(() => {
    void loadBilling().then((r) => {
      if (r.missing || (!r.data && !r.error)) return setHidden(true);
      if (r.error) return setErr(r.error);
      setBilling(r.data);
    });
  }, []);

  if (hidden) return null;

  const open = async () => {
    setBusy(true);
    setErr(null);
    const r = await openBillingPortal();
    if (r.url) {
      window.location.assign(r.url);
      return;
    }
    setBusy(false);
    setErr(r.error);
  };

  const st = billing ? statusLabel(billing) : null;
  const trial = billing ? isTrial(billing) : false;
  const ended = st?.tone === 'off';

  return (
    <Card title="Billing" description="Your plan, and where to cancel, change your card or download invoices.">
      {back ? (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          Welcome back. Changes you made on the billing page can take a minute to show here.
        </p>
      ) : null}
      {!billing && !err ? <span className="skeleton inline-block h-3 w-40" /> : null}
      {billing && st ? (
        <>
          <div className="divide-y divide-slate-100 text-sm">
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-slate-500">Plan</span>
              <span className="font-medium text-slate-900" data-testid="billing-plan">{planLabel(billing)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-slate-500">Status</span>
              <span
                data-testid="billing-status"
                className={`pill ${
                  st.tone === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : st.tone === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {st.text}
              </span>
            </div>
            {billing.expiry_date ? (
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-slate-500">{ended ? 'Access until' : trial ? 'Free trial ends' : 'Current period ends'}</span>
                <span className="font-medium text-slate-900" data-testid="billing-date">{fmt(billing.expiry_date)}</span>
              </div>
            ) : null}
          </div>

          {billing.has_subscription ? (
            <div className="mt-4">
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void open()}>
                {busy ? 'Opening…' : 'Manage or cancel subscription'}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Opens Stripe&rsquo;s secure billing page. There you can cancel, change your card or download invoices. If you cancel, you keep
                access until the end of the period you paid for and you are not charged again.
                {trial ? ' A free trial cancelled before it ends is never charged.' : ''}
              </p>
              {st.tone === 'warn' ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Your last payment did not go through. Update your card on the billing page to keep your access.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600" data-testid="billing-managed">
              Your plan is managed by your organization or by our team. To change or cancel it, contact{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand-700 underline underline-offset-2">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          )}
        </>
      ) : null}
      {err ? (
        <div className="mt-3">
          <InlineError error={err} title="Billing" />
        </div>
      ) : null}
    </Card>
  );
}
