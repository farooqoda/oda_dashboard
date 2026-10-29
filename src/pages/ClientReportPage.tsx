import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChartCard, ColumnChart } from '../components/charts';
import { EmptyState, ErrorState, SkeletonCards } from '../components/ui';
import { guessTimeZone } from '../lib/automation';
import { loadAgencyClients, loadMyAgencies, type Agency, type AgencyClient } from '../lib/agency';
import { loadActivity, loadDaily, minutesSaved, type ActivityRow, type DailyRow } from '../lib/team';
import { PRESETS, bucket, hours, pct, preset, sum } from '../lib/teamStats';
import type { FriendlyError } from '../lib/supabase';

const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="card break-inside-avoid px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-ink">{value}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

/** A report an agency sends to its client: their brand, this client's numbers, print to PDF. */
export function ClientReportPage() {
  const { clientId = '' } = useParams();
  const tz = useMemo(() => guessTimeZone(), []);
  const [presetKey, setPresetKey] = useState('last_month');
  const [[from, to], setRange] = useState<[string, string]>(() => preset('last_month'));
  const [agency, setAgency] = useState<Agency | null>(null);
  const [client, setClient] = useState<AgencyClient | null>(null);
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    void (async () => {
      const a = await loadMyAgencies();
      if (a.error) return setError(a.error);
      for (const ag of a.data ?? []) {
        const c = await loadAgencyClients(ag.agency_id);
        const hit = (c.data ?? []).find((x) => x.client_id === clientId);
        if (hit) {
          setAgency(ag);
          setClient(hit);
          return;
        }
      }
      setNotFound(true);
    })();
  }, [clientId]);

  const load = useCallback(async () => {
    if (!client || !from || !to || to < from) return;
    const [a, d] = await Promise.all([loadActivity(from, to, client.client_id, tz), loadDaily(from, to, client.client_id, tz)]);
    if (a.error) return setError(a.error);
    setError(null);
    setRows(a.data);
    setDaily(d.data ?? []);
  }, [client, from, to, tz]);
  useEffect(() => {
    void load();
  }, [load]);

  const t = useMemo(() => sum(rows ?? []), [rows]);
  const saved = useMemo(() => (rows ?? []).reduce((m, r) => m + minutesSaved(r), 0), [rows]);
  const chart = useMemo(() => bucket(daily), [daily]);

  if (notFound) {
    return <EmptyState title="Report not available">This client is not in an agency you run.</EmptyState>;
  }
  if (error) return <ErrorState error={error} onRetry={() => void load()} />;
  if (!client || !agency || !rows) return <SkeletonCards count={4} />;

  const brand = agency.brand_name || agency.name;
  const conversations = t.messages + t.followups + t.replies_sent;

  return (
    <article className="mx-auto max-w-5xl print:max-w-none" aria-label="Client report">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <Link to="/agency" className="btn-secondary">
          ← Agency
        </Link>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Period
            <select
              className="input py-1.5 text-sm"
              value={presetKey}
              onChange={(e) => {
                setPresetKey(e.target.value);
                if (e.target.value !== 'custom') setRange(preset(e.target.value));
              }}
            >
              {PRESETS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
              <option value="custom">Custom dates</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            From
            <input type="date" className="input py-1.5 text-sm" value={from} max={to} onChange={(e) => { setPresetKey('custom'); setRange([e.target.value, to]); }} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            To
            <input type="date" className="input py-1.5 text-sm" value={to} min={from} onChange={(e) => { setPresetKey('custom'); setRange([from, e.target.value]); }} />
          </label>
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </div>
      </div>

      <header className="card mb-6 flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-4">
          {agency.logo_url ? (
            <img
              src={agency.logo_url}
              alt=""
              className="h-12 max-w-[180px] object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
          <div>
            <p className="text-sm font-semibold text-slate-600">{brand}</p>
            <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">LinkedIn outreach report</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Prepared for</p>
          <p className="text-lg font-bold text-ink">{client.client_name}</p>
          <p className="text-sm text-slate-600">
            {fmtDay(from)} – {fmtDay(to)}
          </p>
        </div>
      </header>

      <section aria-label="Results" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Connection requests" value={t.invites} note="personal invites sent" />
        <Kpi label="Accepted" value={t.accepted} note={`acceptance ${pct(t.accepted, t.invites)}`} />
        <Kpi label="Replies" value={t.replies} note={`reply rate ${pct(t.replies, t.messages + t.accepted)}`} />
        <Kpi label="Messages & follow-ups" value={conversations} note="sent in LinkedIn conversations" />
        <Kpi label="Prospects researched" value={t.profiles + t.searched} note={`plus ${t.engagers} people from post engagement`} />
        <Kpi label="Time saved" value={hours(saved)} note={`${t.comments} comments posted · estimate`} />
      </section>

      <div className="mb-6 break-inside-avoid">
        <ChartCard title="Activity over the period" columns={['Day', 'Actions']} rows={chart} emptyMessage="No activity in this period.">
          {(w) => <ColumnChart data={chart} width={w} unit="actions" />}
        </ChartCard>
      </div>

      <section className="card mb-6 break-inside-avoid" aria-label="By account">
        <header className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">By LinkedIn account</h2>
        </header>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-5 py-2 font-medium">Account</th>
                <th className="px-2 py-2 text-right font-medium">Invites</th>
                <th className="px-2 py-2 text-right font-medium">Accepted</th>
                <th className="px-2 py-2 text-right font-medium">Messages</th>
                <th className="px-2 py-2 text-right font-medium">Replies</th>
                <th className="px-5 py-2 text-right font-medium">Acceptance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-2 font-medium text-slate-900">{r.email ?? r.user_id}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.invites}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.accepted}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(r.messages) + Number(r.followups)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.replies}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{pct(Number(r.accepted), Number(r.invites))}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-sm text-slate-500">
                    No accounts in this workspace yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs text-slate-500">
        {agency.report_note ? <p className="mb-2 whitespace-pre-line text-sm text-slate-700">{agency.report_note}</p> : null}
        <p>
          Numbers count what happened between {fmtDay(from)} and {fmtDay(to)} ({tz}). Acceptance = accepted ÷ invites in the period; reply rate = replies ÷ (first messages +
          accepted invites). Time saved is an estimate of doing the same work by hand.
        </p>
        <p className="mt-1">Prepared by {brand}.</p>
      </footer>
    </article>
  );
}
