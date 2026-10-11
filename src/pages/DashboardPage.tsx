import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeadModal } from '../components/modal/LeadModal';
import {
  FollowUpTracker,
  HeadlineBars,
  ModulesCard,
  NetworkCard,
  OutreachCard,
  QueueCard,
  ReplyRateCard,
  SuggestedCard,
} from '../components/home/HomeWidgets';
import { useAuth } from '../data/AuthProvider';
import { followUps, messageQueue, networkNodes, replyFunnel, sentThisWeek, suggestedConnection } from '../lib/home';
import { loadCommentPosts } from '../lib/comments';
import { firstNameOf, greeting } from '../lib/person';
import { outreachQueue, repliedCount } from '../lib/selectors';
import type { CommentPost } from '../lib/types';
import {
  Avatar,
  EmptyState,
  ErrorState,
  SkeletonBoard,
  StagePill,
  TypePill,
  PageHeader,
} from '../components/ui';
import { useLeads } from '../data/LeadsProvider';
import { displayName, formatDate, pluralise, stageOf, stagePillClass } from '../lib/format';
import { dashboardStats, stageCounts } from '../lib/selectors';
import { personalityType } from '../lib/traitsRegistry';
import type { Lead } from '../lib/types';

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
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const { user } = useAuth();
  const stats = useMemo(() => dashboardStats(leads), [leads]);
  const toSend = useMemo(() => outreachQueue(leads).length, [leads]);
  const replied = useMemo(() => repliedCount(leads), [leads]);
  const suggested = useMemo(() => suggestedConnection(leads), [leads]);
  const network = useMemo(() => networkNodes(leads), [leads]);
  const week = useMemo(() => sentThisWeek(leads), [leads]);
  const funnel = useMemo(() => replyFunnel(leads), [leads]);
  const queue = useMemo(() => messageQueue(leads), [leads]);

  // Comment drafts for the follow-up tracker. Read-only; a failure just leaves them out.
  const [posts, setPosts] = useState<CommentPost[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadCommentPosts().then(({ data }) => {
      if (!cancelled && data) setPosts(data);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshing]);
  const tracker = useMemo(() => followUps(leads, posts), [leads, posts]);
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

  const updateScrollState = useCallback(() => {
    const node = boardRef.current;
    if (!node) return;
    // 1px of slack absorbs sub-pixel scroll widths at fractional zoom levels.
    setCanScrollLeft(node.scrollLeft > 1);
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 1);
  }, []);

  // Recheck whenever the board appears, the column set changes, or the window
  // resizes — any of which can make the overflow appear or disappear.
  useEffect(() => {
    updateScrollState();
    if (view !== 'board') return;
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState, view, stages.length, loading]);

  const scrollBoard = (direction: 1 | -1) => {
    const node = boardRef.current;
    if (!node) return;
    // One column plus its gap, so a click lands on a column boundary.
    node.scrollBy({ left: direction * (288 + 16), behavior: 'smooth' });
  };

  if (error) {
    return (
      <>
        <PageHeader title="Build meaningful professional relationships" />
        <ErrorState error={error} onRetry={refresh} />
      </>
    );
  }

  const name = firstNameOf(user);
  const hello = `${greeting()}${name ? `, ${name}` : ''}`;

  return (
    <>
      {/* Hero: greeting, tagline, headline bars and the three big numbers. */}
      <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="min-w-0">
          <p className="text-sm text-slate-600">{hello}</p>
          <h1 className="mt-2 text-[2.4rem] font-normal leading-[1.05] tracking-[-0.035em] text-ink sm:text-[3.4rem]">
            Find the right people.
            <br />
            Build genuine professional relationships.
          </h1>
          <div className="mt-6 max-w-3xl">
            {loading ? (
              <div className="skeleton h-10 w-full rounded-full" />
            ) : (
              <HeadlineBars found={stats.total} highFit={stats.highFit} toSend={toSend} replied={replied} />
            )}
          </div>
        </div>
        <div className="flex items-end gap-8 xl:pb-1">
          {[
            { v: stats.total, l: 'People found' },
            { v: stats.highFit, l: 'High fit (70+)' },
            { v: stats.createdLast7, l: 'Added this week' },
          ].map((n) => (
            <div key={n.l}>
              <p className="text-5xl font-light tabular-nums tracking-[-0.04em] text-ink sm:text-[4rem] sm:leading-none">
                {loading ? '–' : n.v.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-slate-600">{n.l}</p>
            </div>
          ))}
          <button type="button" className="btn-secondary mb-1 hidden sm:inline-flex" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {/* Widgets, laid out like the design: three columns plus the dark queue. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SuggestedCard lead={suggested} onOpen={setOpenId} />
        <NetworkCard nodes={network.nodes} activeThisWeek={network.activeThisWeek} onOpen={setOpenId} />
        <OutreachCard days={week.days} total={week.total} />
        <div className="flex flex-col gap-4 md:row-span-2">
          <ReplyRateCard {...funnel} />
          <QueueCard rows={queue.rows} done={queue.done} total={queue.total} onOpen={setOpenId} />
        </div>
        <ModulesCard />
        <div className="md:col-span-2 xl:col-span-2">
          <FollowUpTracker items={tracker} onOpen={setOpenId} />
        </div>
      </div>

      <div className="mt-10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-xl font-normal tracking-tight text-ink">Pipeline</h2>
            <span className="text-xs text-slate-500">Everyone you found, by stage ·</span>
            <span className="text-xs text-slate-500">
              {stages.length} {pluralise(stages.length, 'stage')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* The board is wider than the viewport at every realistic window
                size, so it needs an explicit affordance — without one the
                trailing stages look as though they do not exist. */}
            {view === 'board' && (canScrollLeft || canScrollRight) ? (
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => scrollBoard(-1)}
                  disabled={!canScrollLeft}
                  aria-label="Scroll the board to earlier stages"
                  className="rounded px-2 py-1 text-sm text-slate-600 hover:text-slate-900 disabled:text-slate-300"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => scrollBoard(1)}
                  disabled={!canScrollRight}
                  aria-label="Scroll the board to later stages"
                  className="rounded px-2 py-1 text-sm text-slate-600 hover:text-slate-900 disabled:text-slate-300"
                >
                  →
                </button>
              </div>
            ) : null}
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
        </div>

        {loading ? (
          <SkeletonBoard />
        ) : leads.length === 0 ? (
          <EmptyState title="No leads in the database">
            The query returned zero rows from gab_leads. Either no leads have been imported yet, or
            the Row Level Security policy for this anon key does not expose any.
          </EmptyState>
        ) : view === 'board' ? (
          <div
            ref={boardRef}
            onScroll={updateScrollState}
            tabIndex={0}
            role="group"
            aria-label="Pipeline board, scrolls horizontally"
            className={`overflow-x-auto pb-2 ${refreshing ? 'is-refreshing' : ''}`}
          >
            <div className="flex min-w-max gap-4">
              {stages.map((row) => {
                const cards = byStage.get(row.stage) ?? [];
                return (
                  <section key={row.stage} className="w-72 shrink-0">
                    <header className={`mb-3 flex items-center justify-between rounded-md border px-3 py-2 ${stagePillClass(row.stage)}`}>
                      <h3 className="truncate text-sm font-semibold" title={row.stage}>
                        {row.stage}
                      </h3>
                      <span className="text-xs font-semibold tabular-nums opacity-80">
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
