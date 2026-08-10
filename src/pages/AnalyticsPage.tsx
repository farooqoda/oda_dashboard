import { useMemo } from 'react';
import {
  ChartCard,
  ColumnChart,
  FunnelChart,
  HorizontalBarChart,
  LineChart,
  type ChartDatum,
} from '../components/charts';
import { EmptyState, ErrorState, PageHeader } from '../components/ui';
import { useLeads } from '../data/LeadsProvider';
import { FIT_BAND_FILL, FIT_BAND_LABEL, fitBand } from '../lib/format';
import {
  bucketCounts,
  fitScoreHistogram,
  leadsPerDay,
  personalityTypeCounts,
  stageCounts,
} from '../lib/selectors';
import { fitScore } from '../lib/traitsRegistry';

const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day : shortDate.format(d);
}

export function AnalyticsPage() {
  const { leads, loading, error, refresh, refreshing } = useLeads();

  const buckets = useMemo<ChartDatum[]>(
    () => bucketCounts(leads).map((r) => ({ label: r.bucket, value: r.count })),
    [leads],
  );
  const stages = useMemo<ChartDatum[]>(
    () => stageCounts(leads).map((r) => ({ label: r.stage, value: r.count })),
    [leads],
  );
  const histogram = useMemo<ChartDatum[]>(
    () => fitScoreHistogram(leads).map((r) => ({ label: r.label, value: r.count })),
    [leads],
  );
  const types = useMemo<ChartDatum[]>(
    () => personalityTypeCounts(leads).map((r) => ({ label: r.type, value: r.count })),
    [leads],
  );
  const perDay = useMemo<ChartDatum[]>(
    () => leadsPerDay(leads).map((r) => ({ label: r.day, value: r.count })),
    [leads],
  );

  const bandCounts = useMemo(() => {
    const counts = { high: 0, mid: 0, low: 0 };
    for (const lead of leads) {
      const score = fitScore(lead.traits);
      if (score === null) continue;
      counts[fitBand(score)] += 1;
    }
    return counts;
  }, [leads]);

  if (error) {
    return (
      <>
        <PageHeader title="Analytics" />
        <ErrorState error={error} onRetry={refresh} />
      </>
    );
  }

  if (!loading && leads.length === 0) {
    return (
      <>
        <PageHeader title="Analytics" />
        <EmptyState title="Nothing to chart yet">
          gab_leads returned no rows, so there is no data to summarise. Charts appear as soon as
          leads exist.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Only what the data can actually answer. Reply rates, meetings booked and send timings are not charted here because nothing in gab_leads or gab_activity records them."
        actions={
          <button type="button" className="btn-secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5">
              <div className="skeleton h-3 w-40" />
              <div className="skeleton mt-4 h-56 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartCard
            title="Leads by bucket"
            description="All ten ODA buckets, including empty ones."
            columns={['Bucket', 'Leads']}
            rows={buckets}
            refreshing={refreshing}
            emptyMessage="No bucket has any leads yet."
          >
            {(width) => <HorizontalBarChart data={buckets} width={width} />}
          </ChartCard>

          <ChartCard
            title="Fit score distribution"
            description="Leads that carry a fit_score, in bins of ten."
            columns={['Score range', 'Leads']}
            rows={histogram}
            refreshing={refreshing}
            emptyMessage="No loaded lead has a fit score recorded."
            footer={
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-3">
                {(['high', 'mid', 'low'] as const).map((band) => (
                  <div key={band} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: FIT_BAND_FILL[band] }}
                    />
                    <span className="text-xs text-slate-600">{FIT_BAND_LABEL[band]}</span>
                    <span className="text-xs font-semibold tabular-nums text-slate-900">
                      {bandCounts[band].toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            }
          >
            {(width) => <ColumnChart data={histogram} width={width} />}
          </ChartCard>

          <ChartCard
            title="Leads by stage"
            description="The seven pipeline stages, in order."
            columns={['Stage', 'Leads']}
            rows={stages}
            refreshing={refreshing}
            emptyMessage="No leads are at any stage yet."
          >
            {(width) => <FunnelChart data={stages} width={width} />}
          </ChartCard>

          <ChartCard
            title="Leads by personality type"
            description="From the disc_type trait, where the profiling step recorded one."
            columns={['Type', 'Leads']}
            rows={types}
            refreshing={refreshing}
            emptyMessage="No personality types have been recorded."
          >
            {(width) => <HorizontalBarChart data={types} width={width} />}
          </ChartCard>

          <ChartCard
            title="Leads created over time"
            description="By the day each row's created_at falls on."
            columns={['Day', 'Leads']}
            rows={perDay.map((d) => ({ label: formatDay(d.label), value: d.value }))}
            refreshing={refreshing}
            emptyMessage="No lead has a usable created_at timestamp."
          >
            {(width) => <LineChart data={perDay} width={width} formatX={formatDay} />}
          </ChartCard>
        </div>
      )}
    </>
  );
}
