import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader, SkeletonCards } from '../components/ui';
import { amPlatformAdmin, loadReportClients, type ReportClient } from '../lib/team';
import { HEALTH_LABEL, loadSenders, reasonsOf, type Health, type Sender } from '../lib/senders';
import { formatDateTime } from '../lib/format';
import type { FriendlyError } from '../lib/supabase';

const BADGE: Record<Health | 'info', string> = {
  risk: 'bg-rose-50 text-rose-800 ring-rose-200',
  watch: 'bg-amber-50 text-amber-800 ring-amber-200',
  offline: 'bg-slate-100 text-slate-700 ring-slate-200',
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
};
const BAR: Record<Health, string> = { risk: 'bg-rose-500', watch: 'bg-amber-500', offline: 'bg-slate-400', good: 'bg-emerald-500' };
const ORDER: Health[] = ['risk', 'watch', 'offline', 'good'];
const HINT: Record<Health, string> = {
  risk: 'Stop or slow down this account now',
  watch: 'Keep an eye on it',
  offline: 'LinkedIn / Chrome not open',
  good: 'Safe to keep sending',
};

const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

function Stat({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-lg font-bold tabular-nums ${tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-ink'}`}>{value}</dd>
      {note ? <dd className="text-xs text-slate-500">{note}</dd> : null}
    </div>
  );
}

function SenderCard({ s, admin }: { s: Sender; admin: boolean }) {
  const used = s.invite_limit > 0 ? Math.min(100, Math.round((100 * s.invites_today) / s.invite_limit)) : 0;
  const reasons = reasonsOf(s);
  const acc = s.acceptance_30d;
  return (
    <article className="card flex min-w-0 flex-col p-5" aria-label={`Sender ${s.email ?? s.user_id}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900" title={s.email ?? s.user_id}>
            {s.email ?? s.user_id}
          </h3>
          <p className="text-xs text-slate-500">
            {admin ? `${s.client_id} · ` : ''}
            {s.ext_seen_at ? `Extension ${ago(s.ext_seen_at)}` : 'Extension never connected'}
            {s.ext_version ? ` · v${s.ext_version}` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${BADGE[s.health]}`}>{HEALTH_LABEL[s.health]}</span>
      </header>

      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-slate-600">
          <span>Invites today</span>
          <span className="tabular-nums">
            {s.invites_today} / {s.invite_limit}
            {s.warmup_on ? ` (warm-up, full limit ${s.daily_quota})` : ''}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Invites used today" aria-valuenow={used} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${used >= 100 ? 'bg-amber-500' : BAR[s.health === 'offline' ? 'good' : s.health]}`} style={{ width: `${used}%` }} />
        </div>
      </div>

      <dl className="mb-4 grid grid-cols-2 gap-3 min-[480px]:grid-cols-3">
        <Stat label="Invites, 7 days" value={s.invites_7d} tone={s.invites_7d >= 150 ? 'bad' : s.invites_7d >= 100 ? 'warn' : undefined} />
        <Stat
          label="Acceptance, 30 days"
          value={acc === null ? '—' : `${acc}%`}
          note={`${s.accepted_30d} of ${s.invites_30d}`}
          tone={acc !== null && s.invites_30d >= 20 ? (acc < 15 ? 'bad' : acc < 25 ? 'warn' : undefined) : undefined}
        />
        <Stat label="Replies, 30 days" value={s.replies_30d} />
        <Stat label="Pending invites" value={s.pending} note={s.pending_old ? `${s.pending_old} over 3 weeks` : undefined} tone={s.pending >= 400 ? 'bad' : s.pending >= 250 ? 'warn' : undefined} />
        <Stat label="Failed, 7 days" value={s.failed_7d} tone={s.failed_7d >= 5 ? 'warn' : undefined} />
        <Stat label="In the queue" value={s.queued} />
      </dl>

      {reasons.length ? (
        <ul className="mt-auto space-y-1.5" aria-label="Why">
          {reasons.map((r) => (
            <li key={r.text} className={`rounded-md px-2.5 py-1.5 text-xs ring-1 ${BADGE[r.level]}`}>
              {r.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-auto rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 ring-1 ring-emerald-200">All good — nothing to do.</p>
      )}
      {s.last_warning_text && s.last_warning_at ? (
        <p className="mt-2 text-xs text-slate-500">
          Last LinkedIn warning: {formatDateTime(s.last_warning_at)} ({s.last_warning_text})
        </p>
      ) : null}
    </article>
  );
}

export function SendersPage() {
  const [admin, setAdmin] = useState(false);
  const [clients, setClients] = useState<ReportClient[] | null>(null);
  const [params] = useSearchParams();
  const [client, setClient] = useState(() => params.get('client') ?? '');
  const [rows, setRows] = useState<Sender[] | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [missing, setMissing] = useState(false);
  const [show, setShow] = useState<Health | 'all'>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    void amPlatformAdmin().then(setAdmin);
    void loadReportClients().then((r) => setClients(r.data ?? []));
  }, []);
  const load = useCallback(async () => {
    const r = await loadSenders(client || null);
    if (r.error) {
      setMissing(!!r.missing);
      return setError(r.error);
    }
    setError(null);
    setRows(r.data);
  }, [client]);
  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Health, number> = { risk: 0, watch: 0, offline: 0, good: 0 };
    for (const s of rows ?? []) c[s.health] += 1;
    return c;
  }, [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((s) => (show === 'all' || s.health === show) && (!t || (s.email ?? '').toLowerCase().includes(t) || s.client_id.toLowerCase().includes(t)));
  }, [rows, show, q]);
  const today = (rows ?? []).reduce((a, s) => a + s.invites_today, 0);
  const cap = (rows ?? []).reduce((a, s) => a + s.invite_limit, 0);

  return (
    <>
      <PageHeader
        title="Senders health"
        description="Every LinkedIn account on your team: how much it sent, acceptance, pending invites and LinkedIn warnings — so you can slow down an account before LinkedIn restricts it."
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
        missing ? (
          <EmptyState title="One database step is missing">Run the “Senders health” SQL (i2) in Supabase, then refresh.</EmptyState>
        ) : (
          <ErrorState error={error} onRetry={() => void load()} />
        )
      ) : !rows ? (
        <SkeletonCards count={3} />
      ) : rows.length === 0 ? (
        <EmptyState title="No senders to show">Only team managers and the platform admin see this page, for teams with members.</EmptyState>
      ) : (
        <>
          <section aria-label="Summary" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {ORDER.map((h) => (
              <button
                key={h}
                type="button"
                aria-pressed={show === h}
                onClick={() => setShow(show === h ? 'all' : h)}
                className={`card px-4 py-3 text-left transition ${show === h ? 'ring-2 ring-sun-500' : 'hover:ring-1 hover:ring-slate-300'}`}
              >
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${BAR[h]}`} aria-hidden="true" />
                  <span className="text-2xl font-extrabold tabular-nums text-ink">{counts[h]}</span>
                </span>
                <span className="block text-sm font-semibold text-slate-800">{HEALTH_LABEL[h]}</span>
                <span className="block text-xs text-slate-500">{HINT[h]}</span>
              </button>
            ))}
            <div className="card col-span-2 px-4 py-3 md:col-span-1">
              <span className="block text-2xl font-extrabold tabular-nums text-ink">
                {today} <span className="text-base font-semibold text-slate-500">/ {cap}</span>
              </span>
              <span className="block text-sm font-semibold text-slate-800">Invites today</span>
              <span className="block text-xs text-slate-500">all {rows.length} accounts together</span>
            </div>
          </section>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {clients && clients.length > 1 ? (
              <select className="input w-56 py-1.5 text-sm" aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">All clients ({clients.length})</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.client_id} ({c.members})
                  </option>
                ))}
              </select>
            ) : null}
            <input className="input w-56 py-1.5 text-sm" placeholder="Find an account" aria-label="Find an account" value={q} onChange={(e) => setQ(e.target.value)} />
            {show !== 'all' ? (
              <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setShow('all')}>
                Show all
              </button>
            ) : null}
            <span className="text-xs text-slate-500">Worst first.</span>
          </div>

          {shown.length === 0 ? (
            <p className="card px-5 py-6 text-center text-sm text-slate-500">Nobody here.</p>
          ) : (
            <section aria-label="Senders" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((s) => (
                <SenderCard key={s.client_id + s.user_id} s={s} admin={admin || (clients?.length ?? 0) > 1} />
              ))}
            </section>
          )}
          <p className="mt-4 text-xs text-slate-500">
            How it is judged: “At risk” = a LinkedIn warning in the last 3 days, a safety pause, acceptance under 15%, 150+ invites in a week or 400+ pending. “Watch” = acceptance under 25%, 100+ invites in a week, 250+ pending, 100+ pending for over 3 weeks, or 5+ failed sends. Acceptance counts people who accepted in the last 30 days against invites sent in the last 30 days.
          </p>
        </>
      )}
    </>
  );
}
