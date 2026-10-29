import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader, SkeletonTable } from '../components/ui';
import { amPlatformAdmin } from '../lib/team';
import {
  customerState,
  daysLeft,
  loadCustomers,
  loadSignupFeed,
  markSignupsSeen,
  type Customer,
  type SignupEvent,
} from '../lib/customers';
import { formatDate, formatDateTime } from '../lib/format';
import type { FriendlyError } from '../lib/supabase';

type Show = 'all' | 'trial' | 'paying' | 'problem' | 'no_dashboard' | 'no_extension';
const SHOWS: { id: Show; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'trial', label: 'On free trial' },
  { id: 'paying', label: 'Paying' },
  { id: 'problem', label: 'Payment failed / cancelled / expired' },
  { id: 'no_dashboard', label: 'No dashboard account yet' },
  { id: 'no_extension', label: 'Extension not used yet' },
];

const TONE: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-800 ring-amber-200',
  bad: 'bg-rose-50 text-rose-800 ring-rose-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const EVENT: Record<string, string> = {
  signup: 'New signup (trial started)',
  trialing: 'Trial update',
  renewed: 'Paid / renewed',
  payment_failed: 'Payment failed',
  canceled: 'Cancelled',
};

const cap = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

function matches(c: Customer, show: Show): boolean {
  const st = customerState(c).label;
  switch (show) {
    case 'trial':
      return st === 'Free trial';
    case 'paying':
      return st === 'Paying';
    case 'problem':
      return ['Payment failed', 'Cancelled', 'Expired'].includes(st);
    case 'no_dashboard':
      return c.source !== 'dashboard only' && !c.has_dashboard;
    case 'no_extension':
      return c.source !== 'dashboard only' && !c.ext_seen_at;
    default:
      return true;
  }
}

function SignupFeed({ events, onSeen }: { events: SignupEvent[]; onSeen: (ids: number[]) => void }) {
  const fresh = events.filter((e) => !e.seen);
  return (
    <section className="card mb-6" aria-label="Billing events">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Latest signups & billing{' '}
            {fresh.length ? (
              <span className="ml-1 rounded-full bg-sun-500 px-2 py-0.5 text-xs font-bold text-ink">{fresh.length} new</span>
            ) : null}
          </h2>
          <p className="text-xs text-slate-500">From Stripe. The team also gets an email for every new signup.</p>
        </div>
        <button type="button" className="btn-secondary" disabled={!fresh.length} onClick={() => onSeen(fresh.map((e) => e.id))}>
          Mark all as seen
        </button>
      </header>
      {events.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No signups yet.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {events.slice(0, 30).map((e) => (
            <li key={e.id} className={`flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm ${e.seen ? '' : 'bg-sun-50/60'}`}>
              <span>
                {!e.seen ? <span className="mr-2 inline-block h-2 w-2 rounded-full bg-sun-500" aria-label="new" /> : null}
                <b className="text-slate-900">{e.email || e.client_id || 'Unknown customer'}</b>{' '}
                <span className="text-slate-600">· {EVENT[e.event] ?? e.event}{e.plan ? ` · ${cap(e.plan)}` : ''}</span>
                {e.detail ? <span className="text-xs text-slate-500"> ({e.detail})</span> : null}
              </span>
              <span className="text-xs text-slate-500">{formatDateTime(e.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CustomersPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [events, setEvents] = useState<SignupEvent[]>([]);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const [c, f] = await Promise.all([loadCustomers(), loadSignupFeed(100)]);
    if (c.error) return setError(c.error);
    setError(null);
    setRows(c.data);
    setEvents(f.data ?? []);
  }, []);
  useEffect(() => {
    void amPlatformAdmin().then((a) => {
      setAdmin(a);
      if (a) void load();
    });
  }, [load]);

  const counts = useMemo(() => {
    const out: Record<Show, number> = { all: 0, trial: 0, paying: 0, problem: 0, no_dashboard: 0, no_extension: 0 };
    for (const c of rows ?? []) for (const s of SHOWS) if (matches(c, s.id)) out[s.id] += 1;
    return out;
  }, [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (c) => matches(c, show) && (!t || c.email.includes(t) || (c.client_id ?? '').toLowerCase().includes(t) || (c.client_name ?? '').toLowerCase().includes(t)),
    );
  }, [rows, show, q]);

  if (admin === false) {
    return (
      <>
        <PageHeader title="Customers" />
        <EmptyState title="Only the platform admin can see customers">Ask your administrator.</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who signed up or has a licence: plan, trial, last dashboard login and when their extension was last seen."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              Refresh
            </button>
            <Link to="/team" className="btn-secondary">
              ← Team activity
            </Link>
          </>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : !rows ? (
        <SkeletonTable rows={6} />
      ) : (
        <>
          <section aria-label="Summary" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {SHOWS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={show === s.id}
                onClick={() => setShow(s.id)}
                className={`card px-4 py-3 text-left transition ${show === s.id ? 'ring-2 ring-sun-500' : 'hover:ring-1 hover:ring-slate-300'}`}
              >
                <span className="block text-2xl font-extrabold tabular-nums text-ink">{counts[s.id]}</span>
                <span className="block text-xs text-slate-600">{s.label}</span>
              </button>
            ))}
          </section>

          <SignupFeed
            events={events}
            onSeen={(ids) =>
              void markSignupsSeen(ids).then((e) => {
                if (e) setError(e);
                else setEvents((ev) => ev.map((x) => (ids.includes(x.id) ? { ...x, seen: true } : x)));
              })
            }
          />

          <section className="card" aria-label="Customers">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">
                {SHOWS.find((s) => s.id === show)?.label} <span className="text-sm font-normal text-slate-500">· {shown.length}</span>
              </h2>
              <input className="input w-56 py-1.5 text-sm" placeholder="Find email or client" aria-label="Find email or client" value={q} onChange={(e) => setQ(e.target.value)} />
            </header>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-2 py-3 font-medium">Plan</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3 font-medium">Trial / renews</th>
                    <th className="px-2 py-3 font-medium">Signed up</th>
                    <th className="px-2 py-3 font-medium">Dashboard last login</th>
                    <th className="px-2 py-3 font-medium">Extension last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const st = customerState(c);
                    const d = daysLeft(c);
                    return (
                      <tr key={c.email + (c.key_hint ?? '') + c.source} className="border-b border-slate-100 align-top last:border-0">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-slate-900">{c.email || <span className="font-normal italic text-slate-500">no email saved</span>}</p>
                          <p className="text-xs text-slate-500">
                            {c.client_name || c.client_id || 'no team'}
                            {c.key_hint ? ` · key …${c.key_hint}` : ''}
                            {c.source === 'manual' ? ' · added by hand' : ''}
                          </p>
                        </td>
                        <td className="px-2 py-3">
                          {cap(c.plan)}
                          {c.billing_period ? <span className="block text-xs text-slate-500">{cap(c.billing_period)}</span> : null}
                        </td>
                        <td className="px-2 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TONE[st.tone]}`}>{st.label}</span>
                          {c.autopilot_on ? <span className="mt-1 block text-xs text-slate-500">Autopilot on</span> : null}
                        </td>
                        <td className="px-2 py-3">
                          {c.expiry_date ? (
                            <>
                              {formatDate(c.expiry_date)}
                              <span className={`block text-xs ${d !== null && d < 0 ? 'text-rose-700' : d !== null && d <= 3 ? 'text-amber-700' : 'text-slate-500'}`}>
                                {d === null ? '' : d < 0 ? `${-d} days ago` : d === 0 ? 'today' : `in ${d} days`}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-2 py-3 text-slate-700">{formatDate(c.signed_up_at ?? c.dashboard_since) ?? '—'}</td>
                        <td className="px-2 py-3">
                          {!c.has_dashboard ? (
                            <span className="text-xs text-amber-700">No account yet</span>
                          ) : c.last_login_at ? (
                            <>
                              {ago(c.last_login_at)}
                              <span className="block text-xs text-slate-500">{formatDateTime(c.last_login_at)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-500">Never signed in</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {c.ext_seen_at ? (
                            <>
                              {ago(c.ext_seen_at)}
                              <span className="block text-xs text-slate-500">{c.ext_version ? `v${c.ext_version}` : ''}</span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-500">{c.source === 'dashboard only' ? '—' : 'Not used yet'}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {shown.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-500">
                        Nobody here.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
          <p className="mt-3 text-xs text-slate-500">
            “Free trial” = a Stripe signup with no payment yet. Stripe stays the source of truth for billing. Licence keys are never shown here, only their last 4 characters.
          </p>
        </>
      )}
    </>
  );
}
