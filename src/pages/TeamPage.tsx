import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, PageHeader, SkeletonCards } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { loadTeam, useIsManager, type TeamMember } from '../lib/team';
import type { FriendlyError } from '../lib/supabase';

const DAY = 86400000;

function health(m: TeamMember): { text: string; tone: string }[] {
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

const NUM: Array<{ key: keyof TeamMember; label: string; title: string }> = [
  { key: 'invites', label: 'Invites', title: 'Connection requests sent' },
  { key: 'messages', label: 'Messages', title: 'First messages sent' },
  { key: 'followups', label: 'Follow-ups', title: 'People who got a follow-up' },
  { key: 'accepted', label: 'Accepted', title: 'Invites accepted' },
  { key: 'replies', label: 'Replies', title: 'People who wrote back' },
  { key: 'replies_sent', label: 'Answered', title: 'Replies sent through Message Studio' },
  { key: 'queued', label: 'Queued', title: 'Waiting in the send queue now' },
];

export function TeamPage() {
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

  const totals = (rows ?? []).reduce<Record<string, number>>((t, m) => {
    for (const n of NUM) t[n.key as string] = (t[n.key as string] ?? 0) + (Number(m[n.key]) || 0);
    return t;
  }, {});

  return (
    <>
      <PageHeader
        title="Team"
        description="What each member of your team did on LinkedIn, and anything that needs attention."
        actions={
          <span className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              Period
              <select className="input py-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={1}>Today</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
              </select>
            </label>
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              Refresh
            </button>
          </span>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : rows === null ? (
        <SkeletonCards count={3} />
      ) : rows.length === 0 ? (
        <EmptyState title={manager ? 'No team members yet' : 'This page is for managers'}>
          {manager
            ? 'Members appear here once they join your workspace.'
            : 'Ask your administrator to make you a manager to see your team’s activity.'}
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {NUM.map((n) => (
              <div key={n.key} className="card p-3" title={n.title}>
                <p className="text-xs text-slate-500">{n.label}</p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{totals[n.key as string] ?? 0}</p>
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">Member</th>
                  {NUM.map((n) => (
                    <th key={n.key} className="px-2 py-3 text-right font-medium" title={n.title}>
                      {n.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.user_id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{m.email ?? m.user_id}</p>
                      <p className="text-xs text-slate-500">
                        {m.invites_today}/{m.daily_quota ?? 20} invites today
                        {m.last_activity_at ? ` · last send ${formatDateTime(m.last_activity_at)}` : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.inbox_checked_at ? `Inbox checked ${formatDateTime(m.inbox_checked_at)}` : 'Inbox not checked yet'}
                        {m.ext_version ? ` · v${m.ext_version}` : ''}
                      </p>
                    </td>
                    {NUM.map((n) => (
                      <td key={n.key} className="px-2 py-3 text-right tabular-nums">
                        {Number(m[n.key]) || 0}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {health(m).map((h) => (
                          <span key={h.text} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${h.tone}`}>
                            {h.text}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Counts are people, not messages (someone who got two follow-ups counts once). “Queued” and “to approve” are right now; the rest
            is for the period chosen.
          </p>
        </>
      )}
    </>
  );
}
