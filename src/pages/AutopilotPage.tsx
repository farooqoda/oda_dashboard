import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, FitBadge, InlineError, PageHeader, SkeletonTable } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import {
  AP_DEFAULTS,
  AP_LIMITS,
  addSignal,
  deleteSignal,
  isMissingAutopilot,
  forgetReadyCount,
  hasPhase2,
  loadWarmLeads,
  loadAutopilotSettings,
  loadAutopilotStatus,
  requestRunNow,
  statusText,
  type AutopilotStatus,
  loadSignalStats,
  loadSignals,
  saveAutopilotSettings,
  setSignalActive,
  signalTitle,
  type AutopilotLead,
  type AutopilotPatch,
  type AutopilotSettings,
  type Signal,
  type SignalKind,
  type SignalStats,
  type WarmLead,
} from '../lib/autopilot';
import { FIT_HIGH } from '../lib/constants';
import { queueLeads } from '../lib/messages';
import { kickAutopilot, useExtensionTask } from '../lib/extensionBridge';
import { formatDateTime } from '../lib/format';
import type { FriendlyError } from '../lib/supabase';

const MIN_EXTENSION = [4, 32, 0];
const RUN_NOW_EXTENSION = [4, 33, 0];
function olderThan(version: string | null, min: number[]): boolean {
  if (!version) return false;
  const v = version.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < min.length; i++) {
    if ((v[i] ?? 0) !== min[i]) return (v[i] ?? 0) < min[i];
  }
  return false;
}

const STATUS_TEXT: Record<AutopilotLead['status'], { text: string; cls: string }> = {
  queued: { text: 'Waiting to sync', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  new: { text: 'In People Search', cls: 'bg-slate-50 text-slate-700 border-slate-200' },
  scraping: { text: 'Syncing now', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  done: { text: 'Synced', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  failed: { text: 'Sync failed', cls: 'bg-red-50 text-red-800 border-red-200' },
  skipped: { text: 'Skipped', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

function NumberField({
  id,
  label,
  hint,
  value,
  range,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  range: readonly [number, number];
  onChange: (n: number) => void;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className="input w-32"
        min={range[0]}
        max={range[1]}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="text-xs text-slate-500">{hint}</span>
    </label>
  );
}

const TONE_CLS = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  bad: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
} as const;
const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** H3: is Autopilot running, and if not, why — plus Run now. */
function StatusCard({ status, on, activeCount, version, onRunNow, runMsg, busy }: {
  status: AutopilotStatus;
  on: boolean;
  activeCount: number;
  version: string | null;
  onRunNow: () => void;
  runMsg: string | null;
  busy: boolean;
}) {
  const st = statusText(status);
  const extOk = version ? !olderThan(version, RUN_NOW_EXTENSION) : !!status.ext_version && !olderThan(status.ext_version, RUN_NOW_EXTENSION);
  const seenRecently = !!status.ext_seen_at && Date.now() - new Date(status.ext_seen_at).getTime() < 60 * 60 * 1000;
  const hours = status.schedule_on
    ? `${(status.work_days ?? [1, 2, 3, 4, 5]).map((d) => DAY_NAMES[d]).join(', ')} ${status.work_start ?? ''}–${status.work_end ?? ''}${status.work_tz ? ` (${status.work_tz})` : ''}`
    : 'any time (no working hours set)';
  const checks: { ok: boolean; text: string; hint?: string }[] = [
    { ok: on, text: 'Autopilot is switched on', hint: 'Switch it on below (Run now works even when it is off).' },
    { ok: activeCount > 0, text: `${activeCount} active ${activeCount === 1 ? 'keyword or creator' : 'keywords / creators'}`, hint: 'Add at least one below.' },
    {
      ok: extOk,
      text: `Extension 4.33 or newer${version || status.ext_version ? ` (yours: ${version ?? status.ext_version})` : ''}`,
      hint: 'Update in chrome://extensions (Developer mode → Update), or wait for Chrome to update it.',
    },
    {
      ok: seenRecently,
      text: `LinkedIn open in Chrome${status.ext_seen_at ? ` (extension last seen ${ago(status.ext_seen_at)})` : ''}`,
      hint: 'Autopilot only works while a LinkedIn tab is open in Chrome on a computer that is awake. The tab can be in the background.',
    },
    { ok: !status.paused_until, text: status.paused_until ? `Paused until ${formatDateTime(status.paused_until)} (LinkedIn warning)` : 'Not paused by a LinkedIn warning' },
  ];
  return (
    <section className="card mb-6 p-5" aria-label="Autopilot status">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-ink">Is Autopilot working?</h2>
          <p className={`mt-2 rounded-lg border px-3 py-2 text-sm ${TONE_CLS[st.tone]}`} role="status">
            {st.text}
            {status.status_at ? <span className="ml-1 text-xs opacity-75">({ago(status.status_at)})</span> : null}
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
            <div>
              <dt className="inline">Last run: </dt>
              <dd className="inline font-semibold text-slate-800">{status.last_run_at ? formatDateTime(status.last_run_at) : 'not yet'}</dd>
            </div>
            <div>
              <dt className="inline">Next signal due: </dt>
              <dd className="inline font-semibold text-slate-800">
                {status.next_due_at ? (new Date(status.next_due_at).getTime() <= Date.now() + 60000 ? 'now' : formatDateTime(status.next_due_at)) : '—'}
              </dd>
            </div>
            <div>
              <dt className="inline">Working hours: </dt>
              <dd className="inline font-semibold text-slate-800">{hours}</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button type="button" id="ap-run-now" className="btn-primary" disabled={busy || activeCount === 0 || !!status.paused_until || status.run_now_pending} onClick={onRunNow}>
            {status.run_now_pending ? 'Run requested…' : 'Run now'}
          </button>
          <p className="max-w-[260px] text-right text-xs text-slate-500">One run at once, even outside working hours. It opens in a new LinkedIn tab so you can watch.</p>
        </div>
      </div>
      {runMsg ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{runMsg}</p> : null}
      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2" aria-label="What Autopilot needs">
        {checks.map((c) => (
          <li key={c.text} className="flex gap-2 text-sm">
            <span aria-hidden="true" className={c.ok ? 'text-emerald-600' : 'text-amber-600'}>
              {c.ok ? '✓' : '!'}
            </span>
            <span className={c.ok ? 'text-slate-700' : 'text-slate-900'}>
              {c.text}
              {!c.ok && c.hint ? <span className="block text-xs text-slate-500">{c.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AutopilotPage() {
  const { user, clientId } = useAuth();
  const userId = user?.id ?? null;
  const { version } = useExtensionTask();

  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const [draft, setDraft] = useState<AutopilotSettings>(AP_DEFAULTS);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [stats, setStats] = useState<Record<number, SignalStats>>({});
  const [leads, setLeads] = useState<WarmLead[] | null>(null);
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [missing, setMissing] = useState(false);

  const [kind, setKind] = useState<SignalKind>('keyword');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    const [s, sig, st, ld] = await Promise.all([loadAutopilotSettings(userId), loadSignals(), loadSignalStats(), loadWarmLeads()]);
    const firstError = s.error ?? sig.error ?? st.error ?? ld.error;
    if (firstError) {
      setMissing(isMissingAutopilot(firstError));
      setLoadError(firstError);
      return;
    }
    setLoadError(null);
    setMissing(false);
    setSettings(s.data);
    setDraft(s.data!);
    setSignals(sig.data);
    setStats(Object.fromEntries((st.data ?? []).map((x) => [x.signal_id, x])));
    setLeads(ld.data);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // H3: what the extension last said (refreshes every 20 s while the page is open)
  const loadStatus = useCallback(async () => {
    const r = await loadAutopilotStatus();
    setStatus(r.data);
  }, []);
  useEffect(() => {
    void loadStatus();
    const t = window.setInterval(() => void loadStatus(), 20000);
    return () => window.clearInterval(t);
  }, [loadStatus]);

  const runNow = async () => {
    setBusy('run');
    setRunMsg(null);
    const r = await requestRunNow();
    setBusy(null);
    if (!r.ok) {
      const why: Record<string, string> = {
        no_signals: 'Add at least one keyword or creator first.',
        paused: 'Autopilot is paused for 24 hours after a LinkedIn warning.',
        plan: 'Autopilot is not included in the Starter plan.',
      };
      setRunMsg(why[r.reason ?? ''] ?? `Could not ask for a run (${r.reason ?? 'error'}).`);
      return;
    }
    kickAutopilot();
    setRunMsg(
      'Asked. If LinkedIn is open in this Chrome, a new LinkedIn tab opens within a few seconds and works for a few minutes, then closes. If LinkedIn is open on another computer, it starts there within 5 minutes.',
    );
    void loadStatus();
  };

  const titles = useMemo(() => Object.fromEntries((signals ?? []).map((s) => [s.id, signalTitle(s)])), [signals]);
  const activeCount = (signals ?? []).filter((s) => s.active).length;
  const readyHigh = (leads ?? []).filter((l) => l.ready && l.lead_id !== null && (l.fit ?? 0) >= FIT_HIGH);

  const save = async (patch: AutopilotPatch, key: string) => {
    if (!userId) return;
    setBusy(key);
    setActionError(null);
    setSaved(false);
    const err = await saveAutopilotSettings(userId, clientId ?? null, patch);
    setBusy(null);
    if (err) {
      setActionError(err);
      if (settings) setDraft(settings);
      return;
    }
    const next = { ...(settings ?? AP_DEFAULTS), ...patch } as AutopilotSettings;
    setSettings(next);
    setDraft(next);
    kickAutopilot();   // v4.33: LinkedIn picks up the new settings at once
    void loadStatus();
    if (key === 'filters') setSaved(true);
  };

  // Phase 2: approve here — the invite goes to the Message Studio queue (sent one at a time by the extension)
  const queue = async (rows: WarmLead[], key: string) => {
    if (!userId) return;
    const ids = rows.map((r) => r.lead_id).filter((x): x is number => typeof x === 'number');
    if (!ids.length) return;
    setBusy(key);
    setActionError(null);
    const r = await queueLeads(ids, userId);
    setBusy(null);
    if (r.error) {
      setActionError(r.error);
      return;
    }
    setLeads((list) => (list ?? []).map((l) => (l.lead_id !== null && ids.includes(l.lead_id) ? { ...l, send_status: 'queued', ready: false } : l)));
    forgetReadyCount();
  };

  const add = async () => {
    setBusy('add');
    setActionError(null);
    const r = await addSignal(kind, value.trim(), label.trim());
    setBusy(null);
    if (r.error) {
      setActionError(r.error);
      return;
    }
    setValue('');
    setLabel('');
    await reload();
  };

  const toggle = async (s: Signal) => {
    setBusy('sig-' + s.id);
    const err = await setSignalActive(s.id, !s.active);
    setBusy(null);
    if (err) setActionError(err);
    else setSignals((list) => (list ?? []).map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)));
  };

  const remove = async (s: Signal) => {
    setBusy('sig-' + s.id);
    const err = await deleteSignal(s.id);
    setBusy(null);
    if (err) setActionError(err);
    else setSignals((list) => (list ?? []).filter((x) => x.id !== s.id));
  };

  const filtersChanged =
    !!settings &&
    (['ap_min_engagement', 'ap_max_age_days', 'ap_who', 'ap_posts_per_signal', 'ap_leads_per_run', 'ap_sync_per_run', 'ap_every_hours', 'ap_headline_include', 'ap_headline_exclude'] as const).some(
      (k) => draft[k] !== settings[k],
    );
  const autoChanged = !!settings && (draft.ap_auto_min_fit !== settings.ap_auto_min_fit || draft.ap_auto_per_run !== settings.ap_auto_per_run);
  const bad = (k: keyof typeof AP_LIMITS) => !Number.isFinite(draft[k]) || draft[k] < AP_LIMITS[k][0] || draft[k] > AP_LIMITS[k][1];
  const outOfRange = (['ap_min_engagement', 'ap_max_age_days', 'ap_posts_per_signal', 'ap_leads_per_run', 'ap_sync_per_run', 'ap_every_hours'] as const).some(bad);
  const autoOutOfRange = bad('ap_auto_min_fit') || bad('ap_auto_per_run');

  const header = (
    <PageHeader
      title="Autopilot"
      description="Tell Impact Connect who your market is. While LinkedIn is open, it finds the people liking and commenting on posts in your market, checks who fits, and writes a personal note for each one. You approve before anything is sent."
    />
  );

  if (missing) {
    return (
      <>
        {header}
        <EmptyState title="Autopilot is not set up yet">
          An administrator needs to run the Autopilot SQL (batch H1) in Supabase and import the “ODA GAB - Autopilot” workflow. Then reload
          this page.
        </EmptyState>
      </>
    );
  }
  if (loadError) {
    return (
      <>
        {header}
        <InlineError error={loadError} title="Could not load Autopilot." />
      </>
    );
  }
  if (!settings || !signals || !leads) {
    return (
      <>
        {header}
        <SkeletonTable rows={6} />
      </>
    );
  }

  return (
    <>
      {header}

      {olderThan(version, MIN_EXTENSION) ? (
        <div role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your extension is version {version}. Autopilot needs version 4.32 or newer (4.33 for Run now and the status below). Chrome updates it by itself within a few hours; to update now,
          open <span className="font-mono">chrome://extensions</span>, switch on Developer mode and press Update.
        </div>
      ) : null}

      {status ? (
        <StatusCard status={status} on={draft.ap_on} activeCount={activeCount} version={version} onRunNow={() => void runNow()} runMsg={runMsg} busy={busy === 'run'} />
      ) : null}

      {actionError ? (
        <div className="mb-6">
          <InlineError error={actionError} title="That did not work." />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card
          className="min-w-0 lg:col-span-1"
          title="Autopilot"
          description="Runs by itself while LinkedIn is open in Chrome, inside your working hours, in a small LinkedIn window of its own (it closes when done). There is no Start button: switch it on, or press Run now above."
        >
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <input
              id="ap-on"
              type="checkbox"
              className="h-5 w-5"
              checked={draft.ap_on}
              disabled={busy === 'on'}
              onChange={(e) => void save({ ap_on: e.target.checked }, 'on')}
            />
            {draft.ap_on ? 'Autopilot is on' : 'Autopilot is off'}
          </label>
          <p className="mt-3 text-sm text-slate-600">
            {draft.ap_on
              ? activeCount
                ? `Following ${activeCount} ${activeCount === 1 ? 'signal' : 'signals'}. Each one is checked about every ${draft.ap_every_hours} hours.`
                : 'Add a keyword or a creator below so Autopilot knows where to look.'
              : 'Switch it on when your keywords and creators are ready.'}
          </p>
          <dl className="mt-4 space-y-1 text-xs text-slate-500">
            <div className="flex justify-between gap-2">
              <dt>Last run</dt>
              <dd className="tabular-nums text-slate-700">{settings.ap_last_run_at ? formatDateTime(settings.ap_last_run_at) : 'Not yet'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Warm leads found so far</dt>
              <dd className="tabular-nums text-slate-700">{signals.reduce((n, s) => n + (stats[s.id]?.leads ?? s.total_leads), 0)}</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Nothing is sent by Autopilot. New people get a fit score and a personal note; you review them in{' '}
            <Link to="/leads" className="font-medium underline underline-offset-2">
              Find People
            </Link>{' '}
            and send them from{' '}
            <Link to="/outreach" className="font-medium underline underline-offset-2">
              Message Studio
            </Link>
            . Part of the Growth, Team and Agency plans.
          </p>
        </Card>

        <Card className="min-w-0 lg:col-span-2" title="What to follow" description="Up to 10. Keywords search recent posts; creators are people or companies whose audience you want.">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) void add();
            }}
          >
            <div className="flex flex-col gap-1">
              <span className="label" id="ap-kind-l">
                Type
              </span>
              <div className="flex rounded-lg border border-slate-200 p-0.5" role="radiogroup" aria-labelledby="ap-kind-l">
                {(['keyword', 'creator'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => setKind(k)}
                    className={`rounded-md px-3 py-1.5 text-sm ${kind === k ? 'bg-ink text-white' : 'text-slate-700'}`}
                  >
                    {k === 'keyword' ? 'Keyword' : 'Creator'}
                  </button>
                ))}
              </div>
            </div>
            <label htmlFor="ap-value" className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="label">{kind === 'keyword' ? 'Words people post about' : 'LinkedIn profile or company link'}</span>
              <input
                id="ap-value"
                className="input"
                value={value}
                maxLength={kind === 'keyword' ? 80 : 300}
                placeholder={kind === 'keyword' ? 'e.g. hiring sales team Dubai' : 'https://www.linkedin.com/in/name/'}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label htmlFor="ap-label" className="flex flex-col gap-1 sm:w-40">
              <span className="label">Name (optional)</span>
              <input id="ap-label" className="input" value={label} maxLength={60} placeholder="e.g. Gulf founders" onChange={(e) => setLabel(e.target.value)} />
            </label>
            <button type="submit" className="btn-primary" disabled={!value.trim() || busy === 'add' || signals.length >= 10}>
              {busy === 'add' ? 'Adding…' : 'Add'}
            </button>
          </form>

          {signals.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">Nothing yet. Start with 2–3 keywords your buyers post about, and one creator your buyers follow.</p>
          ) : (
            <div className="relative mt-6 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-semibold">Signal</th>
                    <th className="py-2 pr-3 text-right font-semibold">Posts</th>
                    <th className="py-2 pr-3 text-right font-semibold">People</th>
                    <th className="py-2 pr-3 text-right font-semibold">Warm leads</th>
                    <th className="py-2 pr-3 font-semibold">Last checked</th>
                    <th className="py-2 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => {
                    const st = stats[s.id];
                    return (
                      <tr key={s.id} className={`border-b border-slate-100 align-top ${s.active ? '' : 'opacity-60'}`}>
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="pill border-slate-200 bg-slate-50 text-slate-600">{s.kind === 'keyword' ? 'Keyword' : 'Creator'}</span>
                            {s.kind === 'creator' ? (
                              <a href={s.value} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline-offset-2 hover:underline">
                                {signalTitle(s)}
                              </a>
                            ) : (
                              <span className="font-medium text-ink">{signalTitle(s)}</span>
                            )}
                          </div>
                          {s.label && s.kind === 'keyword' ? <p className="mt-1 text-xs text-slate-500">“{s.value}”</p> : null}
                          {s.last_error ? <p className="mt-1 text-xs text-amber-700">{s.last_error}</p> : null}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">{st?.posts ?? s.total_posts}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{st?.people ?? 0}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {st?.leads ?? s.total_leads}
                          {st && st.synced ? <span className="block text-xs text-slate-500">{st.synced} with notes</span> : null}
                        </td>
                        <td className="py-3 pr-3 text-xs text-slate-600">{s.last_run_at ? formatDateTime(s.last_run_at) : 'Not yet'}</td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button type="button" className="btn-secondary px-3 py-1 text-xs" disabled={busy === 'sig-' + s.id} onClick={() => void toggle(s)}>
                              {s.active ? 'Pause' : 'Resume'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary px-3 py-1 text-xs"
                              disabled={busy === 'sig-' + s.id}
                              onClick={() => void remove(s)}
                              aria-label={`Remove ${signalTitle(s)}`}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card
        className="mt-6"
        title="Which people and how many"
        description="Autopilot picks the posts with the most comments, collects their people, and skips anyone already in your leads or People Search."
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            id="ap-min"
            label="Minimum engagement"
            hint="Reactions + comments a post needs."
            value={draft.ap_min_engagement}
            range={AP_LIMITS.ap_min_engagement}
            onChange={(n) => setDraft({ ...draft, ap_min_engagement: n })}
          />
          <NumberField
            id="ap-age"
            label="Posts from the last (days)"
            hint="1–30. Fresher posts mean warmer people."
            value={draft.ap_max_age_days}
            range={AP_LIMITS.ap_max_age_days}
            onChange={(n) => setDraft({ ...draft, ap_max_age_days: n })}
          />
          <NumberField
            id="ap-posts"
            label="Posts per signal"
            hint="1–10 posts collected each check."
            value={draft.ap_posts_per_signal}
            range={AP_LIMITS.ap_posts_per_signal}
            onChange={(n) => setDraft({ ...draft, ap_posts_per_signal: n })}
          />
          <NumberField
            id="ap-every"
            label="Check each signal every (hours)"
            hint="1–24."
            value={draft.ap_every_hours}
            range={AP_LIMITS.ap_every_hours}
            onChange={(n) => setDraft({ ...draft, ap_every_hours: n })}
          />
          <NumberField
            id="ap-leads"
            label="New warm leads per run"
            hint="5–100. Commenters come first."
            value={draft.ap_leads_per_run}
            range={AP_LIMITS.ap_leads_per_run}
            onChange={(n) => setDraft({ ...draft, ap_leads_per_run: n })}
          />
          <NumberField
            id="ap-sync"
            label="Profiles synced per run"
            hint="0–20. The rest wait in People Search."
            value={draft.ap_sync_per_run}
            range={AP_LIMITS.ap_sync_per_run}
            onChange={(n) => setDraft({ ...draft, ap_sync_per_run: n })}
          />
          <fieldset className="flex flex-col gap-1 sm:col-span-2">
            <legend className="label">Who to keep</legend>
            <div className="mt-1 flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="ap-who" checked={draft.ap_who === 'all'} onChange={() => setDraft({ ...draft, ap_who: 'all' })} />
                Everyone who engaged (commenters first)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="ap-who"
                  checked={draft.ap_who === 'commenters'}
                  onChange={() => setDraft({ ...draft, ap_who: 'commenters' })}
                />
                Only people who commented (fewer, warmer)
              </label>
            </div>
          </fieldset>
          {hasPhase2 ? (
            <>
              <label htmlFor="ap-inc" className="flex flex-col gap-1 sm:col-span-2">
                <span className="label">Only keep people whose headline mentions</span>
                <input
                  id="ap-inc"
                  className="input"
                  maxLength={300}
                  placeholder="e.g. founder, CEO, head of, director"
                  value={draft.ap_headline_include}
                  onChange={(e) => setDraft({ ...draft, ap_headline_include: e.target.value })}
                />
                <span className="text-xs text-slate-500">Separate with commas. Leave empty to keep everyone. People with no visible headline are kept.</span>
              </label>
              <label htmlFor="ap-exc" className="flex flex-col gap-1 sm:col-span-2">
                <span className="label">Skip people whose headline mentions</span>
                <input
                  id="ap-exc"
                  className="input"
                  maxLength={300}
                  placeholder="e.g. student, intern, looking for work"
                  value={draft.ap_headline_exclude}
                  onChange={(e) => setDraft({ ...draft, ap_headline_exclude: e.target.value })}
                />
                <span className="text-xs text-slate-500">Separate with commas. Skipping wins when a headline matches both.</span>
              </label>
            </>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={!filtersChanged || outOfRange || busy === 'filters'}
            onClick={() =>
              void save(
                {
                  ap_min_engagement: draft.ap_min_engagement,
                  ap_max_age_days: draft.ap_max_age_days,
                  ap_who: draft.ap_who,
                  ap_posts_per_signal: draft.ap_posts_per_signal,
                  ap_leads_per_run: draft.ap_leads_per_run,
                  ap_sync_per_run: draft.ap_sync_per_run,
                  ap_every_hours: draft.ap_every_hours,
                  ...(hasPhase2 ? { ap_headline_include: draft.ap_headline_include.trim(), ap_headline_exclude: draft.ap_headline_exclude.trim() } : {}),
                },
                'filters',
              )
            }
          >
            {busy === 'filters' ? 'Saving…' : 'Save'}
          </button>
          {outOfRange ? <span className="text-xs text-red-700">One of the numbers is outside its range.</span> : null}
          {saved && !filtersChanged ? <span className="text-xs text-emerald-700">Saved.</span> : null}
        </div>
      </Card>

      {hasPhase2 ? (
        <Card
          className="mt-6"
          title="Send invites by itself (optional)"
          description="Off by default. When on, after each run the best ready warm leads go to your Message Studio queue as invites."
        >
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <input
              id="ap-auto"
              type="checkbox"
              className="h-5 w-5"
              checked={draft.ap_auto_queue}
              disabled={busy === 'auto'}
              onChange={(e) => void save({ ap_auto_queue: e.target.checked }, 'auto')}
            />
            {draft.ap_auto_queue ? 'Invites are queued by themselves' : 'I approve every invite myself'}
          </label>
          <div className="mt-4 flex flex-wrap items-end gap-5">
            <NumberField
              id="ap-fit"
              label="Only fit score of at least"
              hint={`40–100. ${FIT_HIGH}+ is High fit.`}
              value={draft.ap_auto_min_fit}
              range={AP_LIMITS.ap_auto_min_fit}
              onChange={(n) => setDraft({ ...draft, ap_auto_min_fit: n })}
            />
            <NumberField
              id="ap-per"
              label="At most per run"
              hint="1–50 invites."
              value={draft.ap_auto_per_run}
              range={AP_LIMITS.ap_auto_per_run}
              onChange={(n) => setDraft({ ...draft, ap_auto_per_run: n })}
            />
            <button
              type="button"
              className="btn-secondary"
              disabled={!autoChanged || autoOutOfRange || busy === 'auto-n'}
              onClick={() => void save({ ap_auto_min_fit: draft.ap_auto_min_fit, ap_auto_per_run: draft.ap_auto_per_run }, 'auto-n')}
            >
              {busy === 'auto-n' ? 'Saving…' : 'Save'}
            </button>
            {autoOutOfRange ? <span className="text-xs text-red-700">A number is outside its range.</span> : null}
          </div>
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Queued invites are still sent by the extension one at a time, inside your daily invite limit, working hours and pace. To send them
            without pressing Start, tick ⚡ in Message Studio on LinkedIn. You can still edit or cancel any queued invite in Message Studio.
          </p>
        </Card>
      ) : null}

      <Card
        className="mt-6"
        title="Latest warm leads"
        description="People Autopilot found, newest first. Once synced they get a fit score and a personal note; queue the ones you like."
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {readyHigh.length ? (
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy === 'q-all'} onClick={() => void queue(readyHigh, 'q-all')}>
                {busy === 'q-all' ? 'Queuing…' : `Queue all High fit (${readyHigh.length})`}
              </button>
            ) : null}
            <Link to="/outreach" className="btn-secondary px-3 py-1.5 text-xs">
              Message Studio
            </Link>
          </div>
        }
      >
        {leads.length === 0 ? (
          <p className="text-sm text-slate-500">
            None yet. Once Autopilot is on and has something to follow, new people show up here after its first run.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 pr-3 font-semibold">How they engaged</th>
                  <th className="py-2 pr-3 font-semibold">Fit</th>
                  <th className="py-2 pr-3 font-semibold">Personal note</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold">Found</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const st = STATUS_TEXT[l.status] ?? STATUS_TEXT.new;
                  const how =
                    l.engagement_kind === 'comment'
                      ? `Commented on ${l.engagement_author ?? 'a post'}`
                      : l.engagement_kind === 'repost'
                        ? `Reposted ${l.engagement_author ?? 'a post'}`
                        : `Reacted to ${l.engagement_author ?? 'a post'}`;
                  const sent = l.send_status === 'sent';
                  const queuedNow = l.send_status === 'queued' || l.send_status === 'sending';
                  return (
                    <tr key={l.search_lead_id} className="border-b border-slate-100 align-top">
                      <td className="max-w-[14rem] py-3 pr-3">
                        <a href={l.linkedin_url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline-offset-2 hover:underline">
                          {l.full_name || 'LinkedIn member'}
                        </a>
                        {l.headline ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{l.headline}</p> : null}
                        <p className="mt-1 text-[11px] text-slate-400">{l.signal_id ? titles[l.signal_id] ?? 'Removed signal' : ''}</p>
                      </td>
                      <td className="max-w-[16rem] py-3 pr-3 text-xs text-slate-700">
                        {how}
                        {l.engagement_kind === 'comment' && l.engagement_text ? (
                          <p className="mt-0.5 line-clamp-2 italic text-slate-500">“{l.engagement_text}”</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3">{l.lead_id ? <FitBadge score={l.fit} emptyLabel="–" /> : <span className="text-xs text-slate-400">–</span>}</td>
                      <td className="max-w-[20rem] py-3 pr-3 text-xs text-slate-700">
                        {l.invite_message ? <p className="line-clamp-3">{l.invite_message}</p> : <span className="text-slate-400">{l.lead_id ? 'Writing the note…' : 'After the sync'}</span>}
                      </td>
                      <td className="py-3 pr-3">
                        {sent ? (
                          <span className="pill border-emerald-200 bg-emerald-50 text-emerald-800">Invite sent</span>
                        ) : queuedNow ? (
                          <span className="pill border-sky-200 bg-sky-50 text-sky-800">Invite queued</span>
                        ) : l.send_status === 'failed' ? (
                          <span className="pill border-red-200 bg-red-50 text-red-800">Send failed</span>
                        ) : l.ready ? (
                          <button
                            type="button"
                            className="btn-primary whitespace-nowrap px-3 py-1 text-xs"
                            disabled={busy === 'q-' + l.lead_id}
                            onClick={() => void queue([l], 'q-' + l.lead_id)}
                          >
                            {busy === 'q-' + l.lead_id ? 'Queuing…' : 'Queue invite'}
                          </button>
                        ) : (
                          <span className={`pill ${st.cls}`} title={l.status === 'failed' && l.error ? l.error : undefined}>
                            {l.lead_id && l.status === 'done' ? (l.invite_message ? 'Ready' : 'Note coming') : st.text}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 text-xs tabular-nums text-slate-500">{formatDateTime(l.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
