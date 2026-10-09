import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../data/AuthProvider';
import { useLeads } from '../data/LeadsProvider';
import {
  DAILY_LIMIT_OPTIONS,
  DEFAULT_DAILY_LIMIT,
  deleteSearchLeads,
  loadBulkDailyLimit,
  loadSearchLeads,
  MAX_ROWS,
  MOVES,
  moveSearchLeads,
  profileKey,
  saveBulkDailyLimit,
  type SearchLead,
  type SearchLeadStatus,
} from '../lib/bulkLeads';
import { useExtensionTask } from '../lib/extensionBridge';
import type { FriendlyError } from '../lib/supabase';
import { EmptyState, ErrorState, InlineError, PageHeader, SkeletonTable } from '../components/ui';

type TabKey = 'new' | 'picked' | 'done' | 'failed' | 'skipped' | 'all';
const TABS: { key: TabKey; label: string; match: (s: SearchLeadStatus) => boolean }[] = [
  { key: 'new', label: 'Waiting', match: (s) => s === 'new' },
  { key: 'picked', label: 'Picked to sync', match: (s) => s === 'queued' || s === 'scraping' },
  { key: 'done', label: 'Synced', match: (s) => s === 'done' },
  { key: 'failed', label: 'Failed', match: (s) => s === 'failed' },
  { key: 'skipped', label: 'Skipped', match: (s) => s === 'skipped' },
  { key: 'all', label: 'All', match: () => true },
];

const STATUS_PILL: Record<SearchLeadStatus, { label: string; cls: string }> = {
  new: { label: 'Waiting', cls: 'border-slate-200 bg-slate-50 text-slate-700' },
  queued: { label: 'Picked', cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  scraping: { label: 'Syncing now', cls: 'border-amber-200 bg-amber-50 text-amber-900' },
  done: { label: 'Synced', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  failed: { label: 'Failed', cls: 'border-red-200 bg-red-50 text-red-800' },
  skipped: { label: 'Skipped', cls: 'border-slate-200 bg-white text-slate-500' },
};

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-sun-400">{n}</span>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{children}</p>
      </div>
    </li>
  );
}

export function BulkLeadsPage() {
  const { user, clientId } = useAuth();
  const userId = user?.id ?? null;
  const { leads } = useLeads();
  const extension = useExtensionTask();

  const [rows, setRows] = useState<SearchLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [actionError, setActionError] = useState<FriendlyError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('new');
  const [search, setSearch] = useState('');
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState<number>(DEFAULT_DAILY_LIMIT);
  const [limitSaved, setLimitSaved] = useState(false);

  const refresh = useCallback(async () => {
    const res = await loadSearchLeads();
    if (res.error) setError(res.error);
    else {
      setError(null);
      setRows(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (userId) void loadBulkDailyLimit(userId).then((r) => r.data && setLimit(r.data));
  }, [userId]);

  // While the extension works through picked people, keep the list fresh.
  const working = rows.some((r) => r.status === 'queued' || r.status === 'scraping');
  useEffect(() => {
    if (!working) return;
    const t = window.setInterval(() => void refresh(), 20000);
    return () => window.clearInterval(t);
  }, [working, refresh]);

  const leadKeys = useMemo(() => new Set(leads.map((l) => profileKey(l.linkedin_url)).filter(Boolean) as string[]), [leads]);
  const labels = useMemo(() => Array.from(new Set(rows.map((r) => r.search_label).filter(Boolean) as string[])).sort(), [rows]);
  const counts = useMemo(() => {
    const c = {} as Record<TabKey, number>;
    for (const t of TABS) c[t.key] = rows.filter((r) => t.match(r.status)).length;
    return c;
  }, [rows]);
  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return rows.filter((r) => r.claimed_at && new Date(r.claimed_at) >= start).length;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = TABS.find((x) => x.key === tab)!;
    return rows.filter(
      (r) =>
        t.match(r.status) &&
        (!label || r.search_label === label) &&
        (!q || [r.full_name, r.headline, r.location].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [rows, tab, search, label]);

  useEffect(() => setSelected(new Set()), [tab, label, search]);

  const selectedRows = visible.filter((r) => selected.has(r.id));
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const can = (to: keyof typeof MOVES) => selectedRows.filter((r) => MOVES[to].includes(r.status));

  const act = async (kind: 'queued' | 'new' | 'skipped' | 'delete') => {
    const target = kind === 'delete' ? selectedRows.filter((r) => r.status !== 'scraping') : can(kind);
    if (!target.length) return;
    if (kind === 'delete' && !window.confirm(`Delete ${target.length} collected ${target.length === 1 ? 'person' : 'people'} from this list? Leads already synced stay on the Leads page.`)) return;
    setBusy(true);
    setActionError(null);
    const ids = target.map((r) => r.id);
    const res = kind === 'delete' ? await deleteSearchLeads(ids) : await moveSearchLeads(ids, kind);
    setBusy(false);
    if (res.error) {
      setActionError(res.error);
      return;
    }
    const n = res.data;
    setNotice(
      kind === 'queued'
        ? `${n} picked. On LinkedIn (Lead Scraper task) press “▶️ Sync picked profiles” in the GAB panel.`
        : kind === 'new'
          ? `${n} moved back to Waiting.`
          : kind === 'skipped'
            ? `${n} skipped.`
            : `${n} deleted.`,
    );
    setSelected(new Set());
    void refresh();
  };

  const saveLimit = async (v: number) => {
    if (!userId) return;
    setLimit(v);
    setLimitSaved(false);
    const r = await saveBulkDailyLimit(userId, clientId, v);
    if (r.error) setActionError(r.error);
    else setLimitSaved(true);
  };

  if (error) {
    return (
      <>
        <PageHeader title="Bulk Leads" />
        <ErrorState error={error} onRetry={() => void refresh()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Bulk Leads"
        description="People collected from your LinkedIn searches. Pick who to sync; the extension opens each profile and adds it to Leads with its profile, PDF and invite note."
        actions={
          <button type="button" className="btn-secondary" onClick={() => void refresh()}>
            Refresh
          </button>
        }
      />

      <section className="card mb-6 p-5">
        <ol className="grid gap-4 md:grid-cols-3">
          <Step n={1} title="Collect from a LinkedIn search">
            On LinkedIn, search for people (filters like location, industry or connection degree work too). The GAB panel at the bottom
            right shows “📋 Collect people from this search” — choose how many pages.
          </Step>
          <Step n={2} title="Pick who to sync">
            They land here under Waiting. Select the people you want and press “Sync selected”. People already on your Leads page are
            marked.
          </Step>
          <Step n={3} title="Let the extension sync them">
            On LinkedIn press “▶️ Sync picked profiles”. It opens one profile at a time with a 1–2½ minute pause, up to your daily limit,
            and each becomes a full lead.
          </Step>
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-200 pt-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-slate-700">Profiles per day</span>
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              value={limit}
              onChange={(e) => void saveLimit(Number(e.target.value))}
              aria-label="Profiles per day"
            >
              {DAILY_LIMIT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                  {v === 60 ? ' (recommended)' : v > 80 ? ' (higher risk)' : ''}
                </option>
              ))}
            </select>
            {limitSaved ? <span className="text-xs text-good">Saved</span> : null}
          </label>
          <span className="text-slate-600">
            Synced today: <b className="text-slate-900">{today}</b> of {limit}
          </span>
          {extension.status === 'connected' && extension.task !== 'lead_scraper' ? (
            <span className="flex items-center gap-2 text-amber-900">
              Your extension is on another task.
              <button type="button" className="btn-secondary py-1 text-xs" onClick={() => extension.chooseTask('lead_scraper')}>
                Switch to Lead Scraper
              </button>
            </span>
          ) : null}
          {extension.status === 'missing' ? (
            <span className="text-amber-900">The GAB extension is not running in this browser.</span>
          ) : null}
        </div>
      </section>

      <nav className="mb-4 flex flex-wrap gap-1" aria-label="Collected people">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              tab === t.key ? 'border-ink bg-ink text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            {t.label} <span className="tabular-nums opacity-70">{counts[t.key]}</span>
          </button>
        ))}
      </nav>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, headline or location"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:max-w-sm"
          aria-label="Search collected people"
        />
        {labels.length > 1 ? (
          <select
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            aria-label="Search it came from"
          >
            <option value="">All searches</option>
            {labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {notice ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          <span>{notice}</span>
          <button type="button" className="text-xs font-medium hover:underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {actionError ? (
        <div className="mb-4">
          <InlineError error={actionError} />
        </div>
      ) : null}

      {selectedRows.length > 0 ? (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-4 py-2.5">
          <span className="mr-2 text-sm text-brand-900">{selectedRows.length} selected</span>
          {can('queued').length ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void act('queued')}>
              Sync selected ({can('queued').length})
            </button>
          ) : null}
          {can('new').length ? (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act('new')}>
              Back to Waiting ({can('new').length})
            </button>
          ) : null}
          {can('skipped').length ? (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act('skipped')}>
              Skip ({can('skipped').length})
            </button>
          ) : null}
          <button type="button" className="btn-ghost text-critical" disabled={busy} onClick={() => void act('delete')}>
            Delete
          </button>
          <button type="button" className="btn-ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      ) : null}

      {loading ? (
        <SkeletonTable />
      ) : rows.length === 0 ? (
        <EmptyState title="Nobody collected yet">
          Open LinkedIn with the Lead Scraper task, search for people, and press “📋 Collect people from this search” in the GAB panel.
          They will appear here.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing here">No one matches this tab or search.</EmptyState>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)))}
              aria-label="Select all shown"
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            <span>{visible.length.toLocaleString()} shown</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {visible.map((r) => {
              const isLead = leadKeys.has(profileKey(r.linkedin_url) ?? '');
              const pill = STATUS_PILL[r.status];
              return (
                <li key={r.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/70">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    disabled={r.status === 'scraping'}
                    onChange={() =>
                      setSelected((cur) => {
                        const next = new Set(cur);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    aria-label={`Select ${r.full_name ?? 'person'}`}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <a
                        href={r.linkedin_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-semibold text-slate-900 hover:text-brand-700 hover:underline"
                      >
                        {r.full_name ?? r.linkedin_url}
                      </a>
                      {r.degree ? <span className="text-xs text-slate-500">· {r.degree}</span> : null}
                      <span className={`pill ${pill.cls}`}>{pill.label}</span>
                      {isLead ? <span className="pill border-violet-200 bg-violet-50 text-violet-800">Already a lead</span> : null}
                    </div>
                    {r.headline ? <p className="mt-0.5 line-clamp-2 text-sm text-slate-700">{r.headline}</p> : null}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[r.location, r.search_label ? `from “${r.search_label}”` : null].filter(Boolean).join(' · ')}
                    </p>
                    {r.status === 'failed' && r.error ? <p className="mt-1 text-xs text-red-700">{r.error}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length >= MAX_ROWS ? (
            <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
              Showing the newest {MAX_ROWS.toLocaleString()}. Delete people you no longer need to see older ones.
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}
