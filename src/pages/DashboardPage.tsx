import { useMemo, useState } from 'react';
import { LeadModal } from '../components/modal/LeadModal';
import {
  Avatar,
  EmptyState,
  ErrorState,
  SkeletonBoard,
  SkeletonStatCards,
  StagePill,
  TypePill,
  PageHeader,
} from '../components/ui';
import { useLeads } from '../data/LeadsProvider';
import { displayName, formatDate, stageOf } from '../lib/format';
import { dashboardStats, stageCounts } from '../lib/selectors';
import { personalityType } from '../lib/traitsRegistry';
import type { Lead } from '../lib/types';

function StatCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: number;
  sub?: string | null;
  loading: boolean;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-16" />
      ) : (
        <p className="mt-2 text-3xl font-semibold text-slate-900">{value.toLocaleString()}</p>
      )}
      {/* Sub-lines are only rendered when they are computed from real rows. */}
      {!loading && sub ? <p className="mt-2 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

function LeadCard({ lead, onOpen }: { lead: Lead; onOpen: () => void }) {
  const type = personalityType(lead.traits);
  const created = formatDate(lead.created_at);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card w-full p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40"
    >
      <div className="flex items-start gap-3">
        <Avatar name={displayName(lead)} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900" title={displayName(lead)}>
            {displayName(lead)}
          </p>
          <p className="truncate text-xs text-slate-600" title={lead.company ?? undefined}>
            {lead.company?.trim() || 'No company recorded'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {type ? <TypePill type={type} /> : null}
            {created ? <span className="text-[11px] tabular-nums text-slate-500">{created}</span> : null}
          </div>
        </div>
      </div>
    </button>
  );
}

export function DashboardPage() {
  const { leads, loading, error, refresh, refreshing } = useLeads();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [openId, setOpenId] = useState<number | null>(null);

  const stats = useMemo(() => dashboardStats(leads), [leads]);
  const stages = useMemo(() => stageCounts(leads), [leads]);

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const row of stages) map.set(row.stage, []);
    for (const lead of leads) {
      const stage = stageOf(lead);
      if (!map.has(stage)) map.set(stage, []);
      map.get(stage)!.push(lead);
    }
    return map;
  }, [leads, stages]);

  const listView = useMemo(
    () =>
      [...leads].sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      }),
    [leads],
  );

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={refresh} />
      </>
    );
  }

  const pct = (n: number) =>
    stats.total > 0 ? `${Math.round((n / stats.total) * 100)}% of all leads` : null;

  const totalSub = (() => {
    if (stats.total === 0) return null;
    const parts = [`${stats.createdLast7.toLocaleString()} added in the last 7 days`];
    if (stats.weekOverWeekDelta !== null) {
      const d = Math.round(stats.weekOverWeekDelta);
      parts.push(`${d >= 0 ? '+' : ''}${d}% vs the 7 days before`);
    }
    return parts.join(' · ');
  })();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything below is counted from the rows currently loaded from Supabase."
        actions={
          <button type="button" className="btn-secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {loading ? (
        <SkeletonStatCards />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total leads" value={stats.total} sub={totalSub} loading={false} />
          <StatCard
            label="Profiled"
            value={stats.profiled}
            sub={pct(stats.profiled)}
            loading={false}
          />
          <StatCard
            label="High fit (70+)"
            value={stats.highFit}
            sub={
              stats.profiled > 0
                ? `${Math.round((stats.highFit / stats.profiled) * 100)}% of profiled leads`
                : null
            }
            loading={false}
          />
          <StatCard
            label="Needs review"
            value={stats.needsReview}
            sub={pct(stats.needsReview)}
            loading={false}
          />
        </div>
      )}

      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Pipeline</h2>
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
            {(['board', 'list'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  view === v ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {v} view
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <SkeletonBoard />
        ) : leads.length === 0 ? (
          <EmptyState title="No leads in the database">
            The query returned zero rows from gab_leads. Either no leads have been imported yet, or
            the Row Level Security policy for this anon key does not expose any.
          </EmptyState>
        ) : view === 'board' ? (
          <div className={`overflow-x-auto pb-2 ${refreshing ? 'is-refreshing' : ''}`}>
            <div className="flex min-w-max gap-4">
              {stages.map((row) => {
                const cards = byStage.get(row.stage) ?? [];
                return (
                  <section key={row.stage} className="w-72 shrink-0">
                    <header className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                      <h3 className="truncate text-sm font-medium text-slate-800" title={row.stage}>
                        {row.stage}
                      </h3>
                      <span className="text-xs font-semibold tabular-nums text-slate-500">
                        {cards.length}
                      </span>
                    </header>
                    {/* Each column scrolls on its own, so one busy stage cannot
                        stretch the page to several thousand pixels. */}
                    <div className="max-h-[calc(100vh-20rem)] min-h-[6rem] space-y-3 overflow-y-auto pr-1">
                      {cards.length === 0 ? (
                        <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                          No leads at this stage
                        </p>
                      ) : (
                        cards.map((lead) => (
                          <LeadCard key={lead.id} lead={lead} onOpen={() => setOpenId(lead.id)} />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={`card divide-y divide-slate-100 ${refreshing ? 'is-refreshing' : ''}`}>
            {listView.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => setOpenId(lead.id)}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50"
              >
                <Avatar name={displayName(lead)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{displayName(lead)}</p>
                  <p className="truncate text-xs text-slate-600">
                    {[lead.title?.trim(), lead.company?.trim()].filter(Boolean).join(' · ') ||
                      'No title or company recorded'}
                  </p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <TypePill type={personalityType(lead.traits)} />
                </div>
                <div className="shrink-0">
                  <StagePill stage={stageOf(lead)} />
                </div>
                <div className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-slate-500 md:block">
                  {formatDate(lead.created_at) ?? '—'}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <LeadModal leadId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
