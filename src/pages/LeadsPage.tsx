import { useEffect, useMemo, useState } from 'react';
import { FilterPanel } from '../components/FilterPanel';
import { LeadModal } from '../components/modal/LeadModal';
import {
  Avatar,
  EmptyState,
  ErrorState,
  FitBadge,
  PageHeader,
  SkeletonTable,
  StagePill,
  Truncate,
  TypePill,
} from '../components/ui';
import { useLeads } from '../data/LeadsProvider';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { PAGE_SIZE } from '../lib/constants';
import { downloadCsv, leadsToCsv } from '../lib/csv';
import { displayName, formatDate, formatDateCompact, stageOf } from '../lib/format';
import {
  EMPTY_FILTERS,
  filterLeads,
  isFilterActive,
  sortLeads,
  type LeadFilters,
  type SortDirection,
  type SortKey,
} from '../lib/selectors';
import { fitScore, odaBucket, personalityType } from '../lib/traitsRegistry';
import type { Lead } from '../lib/types';

/** Columns the user can hide. Name is always shown, so it is not listed here. */
const TOGGLEABLE = [
  { key: 'title', label: 'Title' },
  { key: 'company', label: 'Company' },
  { key: 'bucket', label: 'Bucket' },
  { key: 'fit_score', label: 'Fit score' },
  { key: 'type', label: 'Type' },
  { key: 'stage', label: 'Stage' },
  { key: 'created_at', label: 'Created' },
] as const;

type ColumnKey = (typeof TOGGLEABLE)[number]['key'];

const ALL_VISIBLE: Record<ColumnKey, boolean> = {
  title: true,
  company: true,
  bucket: true,
  fit_score: true,
  type: true,
  stage: true,
  created_at: true,
};

const STORAGE_KEY = 'oda.leads.columns.v1';

function SortHeader({
  label,
  sortKey,
  current,
  direction,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = current === sortKey;
  return (
    <th scope="col" className={`px-3 py-2 text-left font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-slate-500 hover:text-slate-900"
        aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        <span aria-hidden="true" className={active ? 'text-slate-700' : 'text-slate-300'}>
          {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

export function LeadsPage() {
  const { leads, loading, error, refresh, refreshing } = useLeads();

  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Open by default on wide screens; the panel can be hidden to give the
  // table the full width, which is what keeps it free of horizontal scroll.
  const [showFilters, setShowFilters] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1024,
  );
  const [showColumns, setShowColumns] = useState(false);
  const [visible, setVisible] = useLocalStorage<Record<ColumnKey, boolean>>(STORAGE_KEY, ALL_VISIBLE);

  const filtered = useMemo(() => filterLeads(leads, filters), [leads, filters]);
  const sorted = useMemo(() => sortLeads(filtered, sortKey, direction), [filtered, sortKey, direction]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Any change to the result set sends the user back to page one.
  useEffect(() => {
    setPage(1);
  }, [filters, sortKey, direction]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection(key === 'created_at' || key === 'fit_score' ? 'desc' : 'asc');
    }
  };

  const isColumn = (key: ColumnKey) => visible[key] ?? true;

  const toggleSelected = (id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((l) => selected.has(l.id));

  const toggleAllOnPage = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allOnPageSelected) pageRows.forEach((l) => next.delete(l.id));
      else pageRows.forEach((l) => next.add(l.id));
      return next;
    });
  };

  const selectedRows = sorted.filter((l) => selected.has(l.id));

  const exportRows = (rows: Lead[], suffix: string) => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`leads-${suffix}-${stamp}.csv`, leadsToCsv(rows));
  };

  if (error) {
    return (
      <>
        <PageHeader title="Leads" />
        <ErrorState error={error} onRetry={refresh} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Leads"
        description={
          loading
            ? 'Loading rows from gab_leads…'
            : `${sorted.length.toLocaleString()} of ${leads.length.toLocaleString()} leads shown${
                isFilterActive(filters) ? ' (filters applied)' : ''
              }.`
        }
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowFilters((v) => !v)}
              aria-pressed={showFilters}
            >
              {showFilters ? 'Hide filters' : 'Show filters'}
            </button>
            <div className="relative">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowColumns((v) => !v)}
                aria-expanded={showColumns}
              >
                Columns
              </button>
              {showColumns ? (
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-slate-200 bg-white p-2">
                  <p className="px-2 pb-1 text-xs text-slate-500">Saved to this browser.</p>
                  {TOGGLEABLE.map((col) => (
                    <label
                      key={col.key}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={isColumn(col.key)}
                        onChange={() =>
                          setVisible({ ...visible, [col.key]: !isColumn(col.key) })
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="text-sm text-slate-700">{col.label}</span>
                    </label>
                  ))}
                  <button
                    type="button"
                    className="btn-ghost mt-1 w-full text-xs"
                    onClick={() => setVisible(ALL_VISIBLE)}
                  >
                    Show all
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => exportRows(sorted, 'filtered')}
              disabled={sorted.length === 0}
            >
              Export CSV
            </button>
          </>
        }
      />

      <div className="mb-4">
        <label className="block">
          <span className="sr-only">Search leads</span>
          <input
            type="search"
            className="input max-w-xl"
            placeholder="Search name, company, title and every value inside traits"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
      </div>

      {selectedRows.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-2.5">
          <span className="text-sm text-brand-900">
            {selectedRows.length.toLocaleString()} selected
          </span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => exportRows(selectedRows, 'selected')}
          >
            Export selected
          </button>
          <button type="button" className="btn-ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className={`${showFilters ? 'block' : 'hidden'} lg:w-72 lg:shrink-0`}>
          <FilterPanel
            leads={leads}
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(EMPTY_FILTERS)}
          />
        </div>

        <div className="min-w-0 flex-1">
          {loading ? (
            <SkeletonTable />
          ) : leads.length === 0 ? (
            <EmptyState title="No leads in the database">
              The query returned zero rows from gab_leads. Either no leads have been imported yet,
              or the Row Level Security policy for this anon key does not expose any.
            </EmptyState>
          ) : sorted.length === 0 ? (
            <EmptyState
              title="No leads match these filters"
              action={
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  Reset filters
                </button>
              }
            >
              {leads.length.toLocaleString()} leads are loaded, but none of them match the current
              search and filters.
            </EmptyState>
          ) : (
            <div className={refreshing ? 'is-refreshing' : undefined}>
              {/* Table from md up. */}
              <div className="card hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th scope="col" className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="Select all rows on this page"
                            checked={allOnPageSelected}
                            onChange={toggleAllOnPage}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </th>
                        <SortHeader
                          label="Name"
                          sortKey="full_name"
                          current={sortKey}
                          direction={direction}
                          onSort={onSort}
                          className="w-[21%]"
                        />
                        {isColumn('title') ? (
                          <SortHeader
                            label="Title"
                            sortKey="title"
                            current={sortKey}
                            direction={direction}
                            onSort={onSort}
                            className="w-[13%]"
                          />
                        ) : null}
                        {isColumn('company') ? (
                          <SortHeader
                            label="Company"
                            sortKey="company"
                            current={sortKey}
                            direction={direction}
                            onSort={onSort}
                            className="w-[12%]"
                          />
                        ) : null}
                        {isColumn('bucket') ? (
                          <SortHeader
                            label="Bucket"
                            sortKey="bucket"
                            current={sortKey}
                            direction={direction}
                            onSort={onSort}
                            className="w-[13%]"
                          />
                        ) : null}
                        {isColumn('fit_score') ? (
                          <SortHeader
                            label="Fit"
                            sortKey="fit_score"
                            current={sortKey}
                            direction={direction}
                            onSort={onSort}
                            className="w-[7%]"
                          />
                        ) : null}
                        {isColumn('type') ? (
                          <SortHeader
                            label="Type"
                            sortKey="type"
                            current={sortKey}
                            direction={direction}
                            onSort={onSort}
                            className="w-[8%]"
                          />
                        ) : null}
                        {isColumn('stage') ? (
                          <SortHeader
                            label="Stage"
                            sortKey="stage"
                            current={sortKey}
                            direction={direction}
                            onSort={onSort}
                            className="w-[13%]"
                          />
                        ) : null}
                        {isColumn('created_at') ? (
                          <SortHeader
                            label="Created"
                            sortKey="created_at"
                            current={sortKey}
                            direction={direction}
                            onSort={onSort}
                            className="w-[12%]"
                          />
                        ) : null}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pageRows.map((lead) => (
                        <tr
                          key={lead.id}
                          onClick={() => setOpenId(lead.id)}
                          className="cursor-pointer transition-colors hover:bg-slate-50"
                        >
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${displayName(lead)}`}
                              checked={selected.has(lead.id)}
                              onChange={() => toggleSelected(lead.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Avatar name={displayName(lead)} size="sm" />
                              <span
                                className="min-w-0 flex-1 truncate font-medium text-slate-900"
                                title={displayName(lead)}
                              >
                                {displayName(lead)}
                              </span>
                            </div>
                          </td>
                          {isColumn('title') ? (
                            <td className="px-3 py-2.5 text-slate-700">
                              <Truncate text={lead.title?.trim() || null} />
                            </td>
                          ) : null}
                          {isColumn('company') ? (
                            <td className="px-3 py-2.5 text-slate-700">
                              <Truncate text={lead.company?.trim() || null} />
                            </td>
                          ) : null}
                          {isColumn('bucket') ? (
                            <td className="px-3 py-2.5 text-slate-700">
                              <Truncate text={odaBucket(lead.traits)} />
                            </td>
                          ) : null}
                          {isColumn('fit_score') ? (
                            <td className="px-3 py-2.5">
                              <FitBadge score={fitScore(lead.traits)} />
                            </td>
                          ) : null}
                          {isColumn('type') ? (
                            <td className="px-3 py-2.5">
                              <TypePill type={personalityType(lead.traits)} />
                            </td>
                          ) : null}
                          {isColumn('stage') ? (
                            <td className="px-3 py-2.5">
                              {/* Clips rather than spilling into the next column
                                  when a long stage name meets a narrow viewport. */}
                              <div className="overflow-hidden" title={stageOf(lead)}>
                                <StagePill stage={stageOf(lead)} />
                              </div>
                            </td>
                          ) : null}
                          {isColumn('created_at') ? (
                            <td
                              className="truncate px-3 py-2.5 text-xs tabular-nums text-slate-500"
                              title={formatDate(lead.created_at) ?? undefined}
                            >
                              {formatDateCompact(lead.created_at) ?? '—'}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cards below md — the table would need horizontal scrolling. */}
              <div className="space-y-3 md:hidden">
                {pageRows.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setOpenId(lead.id)}
                    className="card w-full p-4 text-left transition-colors hover:border-brand-300"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar name={displayName(lead)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{displayName(lead)}</p>
                        <p className="truncate text-xs text-slate-600">
                          {[lead.title?.trim(), lead.company?.trim()].filter(Boolean).join(' · ') ||
                            'No title or company recorded'}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {odaBucket(lead.traits) ?? 'No bucket recorded'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <FitBadge score={fitScore(lead.traits)} />
                          <TypePill type={personalityType(lead.traits)} />
                          <StagePill stage={stageOf(lead)} />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <nav className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600">
                  Showing {((safePage - 1) * PAGE_SIZE + 1).toLocaleString()}–
                  {Math.min(safePage * PAGE_SIZE, sorted.length).toLocaleString()} of{' '}
                  {sorted.length.toLocaleString()}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                  >
                    Previous
                  </button>
                  <span className="text-xs tabular-nums text-slate-600">
                    Page {safePage} of {pageCount}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                  >
                    Next
                  </button>
                </div>
              </nav>
            </div>
          )}
        </div>
      </div>

      <LeadModal leadId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
