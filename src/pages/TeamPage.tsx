import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartCard, ColumnChart } from '../components/charts';
import { MemberLimitsCard } from '../components/Limits';
import { EmptyState, ErrorState, PageHeader, SkeletonCards } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { guessTimeZone } from '../lib/automation';
import {
  amPlatformAdmin,
  loadActivity,
  loadDaily,
  loadReportClients,
  loadTeam,
  minutesSaved,
  useIsManager,
  type ActivityRow,
  type DailyRow,
  type ReportClient,
  type TeamMember,
} from '../lib/team';
import type { FriendlyError } from '../lib/supabase';

const DAY = 86400000;

// ---------------------------------------------------------------------------
// Dates (local calendar days, as YYYY-MM-DD)
// ---------------------------------------------------------------------------
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function preset(key: string): [string, string] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = (n: number) => new Date(today.getTime() - n * DAY);
  switch (key) {
    case 'today':
      return [iso(today), iso(today)];
    case '30':
      return [iso(back(29)), iso(today)];
    case 'month':
      return [iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(today)];
    case 'last_month':
      return [iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), iso(new Date(today.getFullYear(), today.getMonth(), 0))];
    case '90':
      return [iso(back(89)), iso(today)];
    default:
      return [iso(back(6)), iso(today)];
  }
}
const PRESETS: Array<[string, string]> = [
  ['today', 'Today'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['month', 'This month'],
  ['last_month', 'Last month'],
  ['90', 'Last 90 days'],
];

// ---------------------------------------------------------------------------
// What the app did (numbers shown everywhere on the page)
// ---------------------------------------------------------------------------
type NumKey = 'profiles' | 'searched' | 'posts' | 'engagers' | 'comments' | 'invites' | 'messages' | 'followups' | 'accepted' | 'replies' | 'replies_sent';
const NUM: Array<{ key: NumKey; label: string; title: string }> = [
  { key: 'profiles', label: 'Profiles saved', title: 'Leads saved with Find People / Sync' },
  { key: 'searched', label: 'Searched', title: 'People Search results synced' },
  { key: 'posts', label: 'Posts', title: 'Posts saved by the Post Scraper' },
  { key: 'engagers', label: 'Engagers', title: 'People collected from likes and comments' },
  { key: 'comments', label: 'Comments', title: 'Comments posted' },
  { key: 'invites', label: 'Invites', title: 'Connection requests sent' },
  { key: 'messages', label: 'Messages', title: 'First messages sent' },
  { key: 'followups', label: 'Follow-ups', title: 'People who got a follow-up' },
  { key: 'accepted', label: 'Accepted', title: 'Invites accepted' },
  { key: 'replies', label: 'Replies', title: 'People who wrote back' },
  { key: 'replies_sent', label: 'Answered', title: 'Replies sent through Message Studio' },
];

/** Up to 14 days: one bar a day; up to ~3 months: one a week; longer: one a month. */
function bucket(daily: DailyRow[]): { label: string; value: number }[] {
  const val = (d: DailyRow) => d.invites + d.messages + d.followups + d.comments + d.profiles;
  const at = (d: DailyRow) => new Date(d.day + 'T00:00:00');
  if (daily.length <= 14) return daily.map((d) => ({ label: at(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: val(d) }));
  const out = new Map<string, number>();
  for (const d of daily) {
    const t = at(d);
    let key: string;
    if (daily.length <= 100) {
      const monday = new Date(t.getTime() - ((t.getDay() + 6) % 7) * DAY);
      key = 'Wk ' + monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else key = t.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    out.set(key, (out.get(key) ?? 0) + val(d));
  }
  return [...out.entries()].map(([label, value]) => ({ label, value }));
}

function sum(rows: ActivityRow[]) {
  const t = {} as Record<NumKey | 'queued' | 'failed' | 'to_approve', number>;
  for (const r of rows) for (const k of [...NUM.map((n) => n.key), 'queued', 'failed', 'to_approve'] as const) t[k] = (t[k] ?? 0) + (Number(r[k]) || 0);
  return t;
}
const hours = (min: number) => (min >= 60 ? `${(min / 60).toFixed(min >= 600 ? 0 : 1)} h` : `${Math.round(min)} min`);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

function health(m: { safety_paused_until: string | null; license_status: string | null; expiry_date: string | null; ext_seen_at: string | null; ext_auto: { ms?: boolean } | null; queued: number; failed: number; to_approve: number }) {
  const out: { text: string; tone: string }[] = [];
  const now = Date.now();
  if (m.safety_paused_until && new Date(m.safety_paused_until).getTime() > now) out.push({ text: '🛑 Paused (LinkedIn warning)', tone: 'bg-red-100 text-red-900' });
  if (m.license_status && m.license_status !== 'active') out.push({ text: `Licence ${m.license_status}`, tone: 'bg-red-100 text-red-900' });
  else if (m.expiry_date && new Date(m.expiry_date + 'T23:59:59').getTime() < now + 7 * DAY) out.push({ text: `Licence ends ${m.expiry_date}`, tone: 'bg-amber-100 text-amber-900' });
  const seen = m.ext_seen_at ? new Date(m.ext_seen_at).getTime() : 0;
  if (!seen) out.push({ text: 'Extension not seen yet', tone: 'bg-slate-100 text-slate-700' });
  else if (now - seen > 2 * DAY) out.push({ text: `Extension last seen ${Math.floor((now - seen) / DAY)} days ago`, tone: 'bg-amber-100 text-amber-900' });
  if (m.queued && seen && m.ext_auto?.ms !== true) out.push({ text: '⚡ auto-start off', tone: 'bg-amber-100 text-amber-900' });
  if (m.failed) out.push({ text: `${m.failed} failed`, tone: 'bg-red-50 text-red-800' });
  if (m.to_approve) out.push({ text: `${m.to_approve} to approve`, tone: 'bg-sky-100 text-sky-900' });
  if (!out.length) out.push({ text: '✓ OK', tone: 'bg-emerald-100 text-emerald-900' });
  return out;
}

function Pills({ items }: { items: { text: string; tone: string }[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((h) => (
        <span key={h.text} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${h.tone}`}>
          {h.text}
        </span>
      ))}
    </span>
  );
}

function MemberTable({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-4 py-3 font-medium">Member</th>
            {NUM.map((n) => (
              <th key={n.key} className="px-2 py-3 text-right font-medium" title={n.title}>
                {n.label}
              </th>
            ))}
            <th className="px-2 py-3 text-right font-medium" title="Estimated time it would take by hand">
              Saved
            </th>
            <th className="px-4 py-3 font-medium">Status now</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.client_id + m.user_id} className="border-b border-slate-100 align-top last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-slate-900">{m.email ?? m.user_id}</p>
                <p className="text-xs text-slate-500">
                  {m.last_activity_at ? `Last send ${formatDateTime(m.last_activity_at)}` : 'Nothing sent yet'}
                  {m.ext_version ? ` · v${m.ext_version}` : ''}
                </p>
              </td>
              {NUM.map((n) => (
                <td key={n.key} className="px-2 py-3 text-right tabular-nums">
                  {Number(m[n.key]) || 0}
                </td>
              ))}
              <td className="px-2 py-3 text-right tabular-nums">{hours(minutesSaved(m))}</td>
              <td className="px-4 py-3">
                <Pills items={health(m)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function TeamPage() {
  const manager = useIsManager();
  const tz = useMemo(() => guessTimeZone(), []);
  const [[from, to], setRange] = useState<[string, string]>(() => preset('7'));
  const [presetKey, setPresetKey] = useState('7');
  const [client, setClient] = useState<string>('');
  const [clients, setClients] = useState<ReportClient[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [error, setError] = useState<FriendlyError | null>(null);

  useEffect(() => {
    void loadReportClients().then((r) => {
      if (r.missing) setLegacy(true);
      else if (r.error) setError(r.error);
      else setClients(r.data);
    });
    void amPlatformAdmin().then(setAdmin);
  }, []);

  const load = useCallback(async () => {
    if (legacy || clients === null || !from || !to || to < from) return;
    setError(null);
    const [a, d] = await Promise.all([loadActivity(from, to, client || null, tz), loadDaily(from, to, client || null, tz)]);
    if (a.error) return setError(a.error);
    setRows(a.data);
    setDaily(d.data ?? []);
  }, [from, to, client, tz, legacy, clients]);
  useEffect(() => {
    void load();
  }, [load]);

  if (legacy) return <LegacyTeamPage />;

  const total = sum(rows ?? []);
  const byClient = new Map<string, ActivityRow[]>();
  for (const r of rows ?? []) byClient.set(r.client_id, [...(byClient.get(r.client_id) ?? []), r]);
  const chart = bucket(daily);
  const badRange = !from || !to || to < from;

  return (
    <>
      <PageHeader
        title="Team"
        actions={
          admin ? (
            <Link to="/team/manage" className="btn-primary">
              Manage teams
            </Link>
          ) : undefined
        }
        description={
          admin
            ? 'Admin view: every client and every member. Pick a date range to see how much work Impact Connect did.'
            : 'What each member of your team did on LinkedIn, and anything that needs attention.'
        }
      />

      <div className="card mb-6 flex flex-wrap items-end gap-3 p-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Period</span>
          <select
            className="input py-1.5"
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
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">From</span>
          <input
            type="date"
            className="input py-1.5"
            value={from}
            max={to}
            onChange={(e) => {
              setPresetKey('custom');
              setRange([e.target.value, to]);
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">To</span>
          <input
            type="date"
            className="input py-1.5"
            value={to}
            min={from}
            onChange={(e) => {
              setPresetKey('custom');
              setRange([from, e.target.value]);
            }}
          />
        </label>
        {clients && clients.length > 1 ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">Client</span>
            <select className="input py-1.5" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">All clients ({clients.length})</option>
              {clients.map((c) => (
                <option key={c.client_id} value={c.client_id}>
                  {c.client_id} · {c.members} {c.members === 1 ? 'member' : 'members'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="btn-secondary" onClick={() => void load()} disabled={badRange}>
          Refresh
        </button>
        <span className="text-xs text-slate-500">Days counted in {tz}.</span>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : rows === null ? (
        <SkeletonCards count={3} />
      ) : rows.length === 0 ? (
        <EmptyState title={manager ? 'No team members yet' : 'This page is for managers'}>
          {manager ? 'Members appear here once they join.' : 'Ask your administrator to make you a manager to see your team’s activity.'}
        </EmptyState>
      ) : (
        <>
          <section aria-label="Totals" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="card col-span-2 bg-ink p-4 text-white sm:col-span-1">
              <p className="text-xs text-white/70">Time saved (estimate)</p>
              <p className="text-3xl font-semibold tabular-nums">{hours(minutesSaved(total))}</p>
              <p className="mt-1 text-[11px] text-white/60">{rows.length} members{admin && !client ? ` · ${byClient.size} clients` : ''}</p>
            </div>
            {NUM.map((n) => (
              <div key={n.key} className="card p-3" title={n.title}>
                <p className="text-xs text-slate-500">{n.label}</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{total[n.key] ?? 0}</p>
              </div>
            ))}
          </section>
          <section aria-label="Rates" className="mb-6 grid gap-3 sm:grid-cols-3">
            <div className="card p-3">
              <p className="text-xs text-slate-500">Acceptance rate</p>
              <p className="text-xl font-semibold tabular-nums">{pct(total.accepted, total.invites)}</p>
              <p className="text-[11px] text-slate-500">accepted ÷ invites in this period</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-slate-500">Reply rate</p>
              <p className="text-xl font-semibold tabular-nums">{pct(total.replies, total.messages + total.accepted)}</p>
              <p className="text-[11px] text-slate-500">replies ÷ (messages + accepted invites)</p>
            </div>
            <div className="card p-3">
              <p className="text-xs text-slate-500">Needs attention now</p>
              <p className="text-xl font-semibold tabular-nums">{(total.failed ?? 0) + (total.to_approve ?? 0)}</p>
              <p className="text-[11px] text-slate-500">
                {total.failed ?? 0} failed · {total.to_approve ?? 0} to approve · {total.queued ?? 0} queued
              </p>
            </div>
          </section>

          <div className="mb-6">
            <ChartCard
              title="Work done per day"
              description="Profiles saved, invites, messages, follow-ups and comments (by day, week or month, depending on the range)"
              columns={['Day', 'Actions']}
              rows={chart}
              emptyMessage="Nothing was done in this period."
            >
              {(w) => <ColumnChart data={chart} width={w} unit="actions" />}
            </ChartCard>
          </div>

          {[...byClient.entries()].map(([cid, members]) => {
            const t = sum(members);
            return (
              <section key={cid} className="card mb-6" aria-label={`${cid} team`}>
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
                  <h2 className="text-base font-semibold text-slate-900">
                    {cid} <span className="text-sm font-normal text-slate-500">· {members.length} {members.length === 1 ? 'member' : 'members'}</span>
                  </h2>
                  <p className="text-xs text-slate-600">
                    {t.invites} invites · {t.messages} messages · {t.followups} follow-ups · {t.replies} replies · <b>{hours(minutesSaved(t))} saved</b>
                  </p>
                </header>
                <MemberTable rows={members} />
              </section>
            );
          })}
          <MemberLimitsCard client={client} />
          <p className="text-xs text-slate-500">
            Counts are people, not messages (someone who got two follow-ups counts once). “Status now”, failed, queued and “to approve”
            are right now; everything else is for the dates chosen. Time saved assumes by hand: 3 min a profile, 2 an invite, 3 a
            message or follow-up, 4 a comment or reply, 1 a search result or post, 30 s an engager.
          </p>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Before the Batch C2 database step: the 7-day manager view
// ---------------------------------------------------------------------------
function LegacyTeamPage() {
  const manager = useIsManager();
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const load = useCallback(async () => {
    setError(null);
    const r = await loadTeam(days);
    if (r.error) setError(r.error);
    else setRows(r.data);
  }, [days]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <>
      <PageHeader
        title="Team"
        description="What each member of your team did on LinkedIn, and anything that needs attention."
        actions={
          <select className="input py-1" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : rows === null ? (
        <SkeletonCards count={3} />
      ) : rows.length === 0 ? (
        <EmptyState title={manager ? 'No team members yet' : 'This page is for managers'}>
          {manager ? 'Members appear here once they join.' : 'Ask your administrator to make you a manager to see your team’s activity.'}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Member</th>
                {(['invites', 'messages', 'followups', 'accepted', 'replies', 'replies_sent', 'queued'] as const).map((k) => (
                  <th key={k} className="px-2 py-3 text-right font-medium">
                    {k.replace('_', ' ')}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.user_id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{m.email ?? m.user_id}</td>
                  {(['invites', 'messages', 'followups', 'accepted', 'replies', 'replies_sent', 'queued'] as const).map((k) => (
                    <td key={k} className="px-2 py-3 text-right tabular-nums">
                      {Number(m[k]) || 0}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <Pills items={health(m)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
