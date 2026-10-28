import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, InlineError, PageHeader, SkeletonTable } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import {
  AP_DEFAULTS,
  AP_LIMITS,
  addSignal,
  deleteSignal,
  isMissingAutopilot,
  loadAutopilotLeads,
  loadAutopilotSettings,
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
} from '../lib/autopilot';
import { useExtensionTask } from '../lib/extensionBridge';
import { formatDateTime } from '../lib/format';
import type { FriendlyError } from '../lib/supabase';

const MIN_EXTENSION = [4, 32, 0];
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
  done: { text: 'Note ready', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
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

export function AutopilotPage() {
  const { user, clientId } = useAuth();
  const userId = user?.id ?? null;
  const { version } = useExtensionTask();

  const [settings, setSettings] = useState<AutopilotSettings | null>(null);
  const [draft, setDraft] = useState<AutopilotSettings>(AP_DEFAULTS);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [stats, setStats] = useState<Record<number, SignalStats>>({});
  const [leads, setLeads] = useState<AutopilotLead[] | null>(null);
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [missing, setMissing] = useState(false);

  const [kind, setKind] = useState<SignalKind>('keyword');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    const [s, sig, st, ld] = await Promise.all([loadAutopilotSettings(userId), loadSignals(), loadSignalStats(), loadAutopilotLeads()]);
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

  const titles = useMemo(() => Object.fromEntries((signals ?? []).map((s) => [s.id, signalTitle(s)])), [signals]);
  const activeCount = (signals ?? []).filter((s) => s.active).length;

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
    if (key === 'filters') setSaved(true);
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
    (['ap_min_engagement', 'ap_max_age_days', 'ap_who', 'ap_posts_per_signal', 'ap_leads_per_run', 'ap_sync_per_run', 'ap_every_hours'] as const).some(
      (k) => draft[k] !== settings[k],
    );
  const outOfRange = (Object.keys(AP_LIMITS) as Array<keyof typeof AP_LIMITS>).some(
    (k) => !Number.isFinite(draft[k]) || draft[k] < AP_LIMITS[k][0] || draft[k] > AP_LIMITS[k][1],
  );

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
          Your extension is version {version}. Autopilot needs version 4.32 or newer. Chrome updates it by itself within a few hours; to update now,
          open <span className="font-mono">chrome://extensions</span>, switch on Developer mode and press Update.
        </div>
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
          description="Runs in a background tab while LinkedIn is open in Chrome, inside your working hours."
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

      <Card
        className="mt-6"
        title="Latest warm leads"
        description="People Autopilot found, newest first. Their notes appear in Find People once they are synced."
        actions={
          <Link to="/bulk-leads" className="btn-secondary px-3 py-1.5 text-xs">
            Open People Search
          </Link>
        }
      >
        {leads.length === 0 ? (
          <p className="text-sm text-slate-500">
            None yet. Once Autopilot is on and has something to follow, new people show up here after its first run.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 pr-3 font-semibold">How they engaged</th>
                  <th className="py-2 pr-3 font-semibold">Signal</th>
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
                  return (
                    <tr key={l.id} className="border-b border-slate-100 align-top">
                      <td className="max-w-[16rem] py-3 pr-3">
                        <a href={l.linkedin_url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline-offset-2 hover:underline">
                          {l.full_name || 'LinkedIn member'}
                        </a>
                        {l.headline ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{l.headline}</p> : null}
                      </td>
                      <td className="max-w-[20rem] py-3 pr-3 text-xs text-slate-700">
                        {how}
                        {l.engagement_kind === 'comment' && l.engagement_text ? (
                          <p className="mt-0.5 line-clamp-2 italic text-slate-500">“{l.engagement_text}”</p>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-600">{l.autopilot_signal_id ? titles[l.autopilot_signal_id] ?? 'Removed' : '–'}</td>
                      <td className="py-3 pr-3">
                        <span className={`pill ${st.cls}`} title={l.status === 'failed' && l.error ? l.error : undefined}>
                          {st.text}
                        </span>
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
