import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../data/AuthProvider';
import {
  DAY_NAMES,
  isPaused,
  loadAutomation,
  saveAutomation,
  timeZones,
  warmupLimit,
  type AutomationPatch,
  type AutomationSettings,
} from '../lib/automation';
import { formatDateTime } from '../lib/format';
import { sendTestDigest } from '../lib/today';
import type { FriendlyError } from '../lib/supabase';
import { Card, InlineError } from './ui';

const CHANGED = 'gab-automation-changed';

/** The signed-in member's automation settings (working hours, warm-up, safety, inbox check). */
export function useAutomation() {
  const { user, clientId } = useAuth();
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) return;
    const r = await loadAutomation(user.id);
    setMissing(!!r.missing);
    setSettings(r.data);
    setError(r.missing ? null : r.error);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Several parts of the page use these settings (banner, Today, bell): keep them in step.
  useEffect(() => {
    const on = (e: Event) => {
      const patch = (e as CustomEvent<AutomationPatch>).detail;
      setSettings((s) => (s ? { ...s, ...patch } : s));
    };
    window.addEventListener(CHANGED, on);
    return () => window.removeEventListener(CHANGED, on);
  }, []);

  const save = useCallback(
    async (patch: AutomationPatch) => {
      if (!user) return null;
      const err = await saveAutomation(user.id, clientId, patch);
      if (!err) window.dispatchEvent(new CustomEvent<AutomationPatch>(CHANGED, { detail: patch }));
      return err;
    },
    [user, clientId],
  );

  return { settings, error, missing, loading, reload, save };
}

// ---------------------------------------------------------------------------
// Banner: LinkedIn showed a warning -> automatic runs are paused
// ---------------------------------------------------------------------------
export function SafetyBanner() {
  const { settings, save } = useAutomation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);
  if (!isPaused(settings)) return null;
  const resume = async () => {
    setBusy(true);
    setErr(await save({ safety_paused_until: null }));
    setBusy(false);
  };
  return (
    <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">🛑 Automatic runs are paused until {formatDateTime(settings!.safety_paused_until)}</p>
          <p className="mt-0.5 text-xs">
            LinkedIn showed a security check or warning
            {settings!.last_warning_at ? ` on ${formatDateTime(settings!.last_warning_at)}` : ''}
            {settings!.last_warning_text ? `: “${settings!.last_warning_text.slice(0, 140)}”` : ''}. Deal with it on LinkedIn and give
            your account a rest. You can still start runs by hand.
          </p>
        </div>
        <button type="button" className="btn-secondary shrink-0" disabled={busy} onClick={() => void resume()}>
          {busy ? 'Resuming…' : 'Resume now'}
        </button>
      </div>
      {err ? <div className="mt-2"><InlineError error={err} /></div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One line: when the extension last read the inbox and what it found
// ---------------------------------------------------------------------------
export function InboxCheckLine() {
  const { settings, missing } = useAutomation();
  if (missing || !settings) return null;
  const r = settings.inbox_last_result;
  return (
    <p className="text-xs text-slate-500">
      📬{' '}
      {settings.inbox_checked_at ? (
        <>
          Inbox last checked {formatDateTime(settings.inbox_checked_at)}
          {r ? (
            <>
              {' '}
              — <b className="text-slate-700">{r.replies ?? 0}</b> new {r.replies === 1 ? 'reply' : 'replies'},{' '}
              <b className="text-slate-700">{r.accepted ?? 0}</b> accepted
            </>
          ) : null}
          .
        </>
      ) : (
        <>Not checked yet.</>
      )}{' '}
      The extension reads your LinkedIn inbox and new connections every 3 hours (or “Check now” on its panel): people who
      write back move to <b>Replied</b>, accepted invites become <b>Connected</b>.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Settings card: working hours, warm-up, safety
// ---------------------------------------------------------------------------
export function AutomationCard({ dailyInviteLimit }: { dailyInviteLimit: number | null }) {
  const { settings, error, missing, loading, save } = useAutomation();
  const [draft, setDraft] = useState<AutomationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<FriendlyError | null>(null);
  const zones = useMemo(() => timeZones(), []);

  useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  if (loading) {
    return (
      <Card title="Working hours & account safety">
        <div className="skeleton h-24 w-full" />
      </Card>
    );
  }
  if (missing) {
    return (
      <Card title="Working hours & account safety">
        <p className="text-sm text-slate-600">
          These settings need the latest database update (Batch A). Ask your administrator to run it, then reload this page.
        </p>
      </Card>
    );
  }
  if (error || !draft) {
    return (
      <Card title="Working hours & account safety">{error ? <InlineError error={error} /> : null}</Card>
    );
  }

  const set = (patch: Partial<AutomationSettings>) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };
  const toggleDay = (d: number) =>
    set({ work_days: draft.work_days.includes(d) ? draft.work_days.filter((x) => x !== d) : [...draft.work_days, d].sort() });
  const daysBad = draft.followup_days.length < 1 || draft.followup_days.some((d) => !Number.isInteger(d) || d < 1 || d > 30);
  const invalid = draft.work_days.length === 0 || draft.work_start === draft.work_end || daysBad;
  const setDay = (i: number, v: number) => set({ followup_days: draft.followup_days.map((d, j) => (j === i ? v : d)) });
  const setCount = (n: number) =>
    set({ followup_days: Array.from({ length: n }, (_, i) => draft.followup_days[i] ?? (i === 0 ? 4 : 7)) });

  const onSave = async () => {
    setSaving(true);
    setSaveErr(null);
    const err = await save({
      schedule_on: draft.schedule_on,
      work_days: draft.work_days,
      work_start: draft.work_start,
      work_end: draft.work_end,
      work_tz: draft.work_tz,
      warmup_on: draft.warmup_on,
      followup_mode: draft.followup_mode,
      followup_days: draft.followup_days,
    });
    setSaving(false);
    if (err) setSaveErr(err);
    else setSaved(true);
  };

  const normal = dailyInviteLimit ?? 20;
  const paused = isPaused(settings);

  return (
    <Card
      title="Working hours & account safety"
      description="Applies to runs the extension starts by itself (⚡). Runs you start by hand always run."
    >
      <div className="space-y-6">
        <section aria-labelledby="hours-h">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-900" id="hours-h">
            <input type="checkbox" checked={draft.schedule_on} onChange={(e) => set({ schedule_on: e.target.checked })} />
            Only work in my working hours
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Outside these hours, nothing starts by itself, and a run that started by itself stops and picks up again next time.
            Normal working hours also look more natural to LinkedIn.
          </p>
          <fieldset disabled={!draft.schedule_on} className="mt-3 space-y-3 disabled:opacity-50">
            <legend className="sr-only">Working days</legend>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={draft.work_days.includes(d)}
                  onClick={() => toggleDay(d)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    draft.work_days.includes(d) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {DAY_NAMES[d]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5">
                From
                <input type="time" className="input w-28 py-1" value={draft.work_start} onChange={(e) => set({ work_start: e.target.value })} />
              </label>
              <label className="flex items-center gap-1.5">
                to
                <input type="time" className="input w-28 py-1" value={draft.work_end} onChange={(e) => set({ work_end: e.target.value })} />
              </label>
              <label className="flex min-w-0 items-center gap-1.5">
                Time zone
                <select className="input max-w-[14rem] py-1" value={draft.work_tz} onChange={(e) => set({ work_tz: e.target.value })}>
                  {(zones.includes(draft.work_tz) ? zones : [draft.work_tz, ...zones]).map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {draft.work_days.length === 0 ? <p className="text-xs text-red-700">Pick at least one day.</p> : null}
            {draft.work_start === draft.work_end ? <p className="text-xs text-red-700">Start and end must differ.</p> : null}
          </fieldset>
        </section>

        <section aria-labelledby="warm-h" className="border-t border-slate-100 pt-5">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-900" id="warm-h">
            <input type="checkbox" checked={draft.warmup_on} onChange={(e) => set({ warmup_on: e.target.checked })} />
            Warm up a new LinkedIn account
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Fewer connection requests a day at first: 8 a day in week 1, 12 in week 2, 16 in week 3, then your normal limit ({normal}).
            The weeks count from your first invite after turning this on.
            {draft.warmup_on && settings?.warmup_on ? (
              <>
                {' '}
                Today’s limit: <b>{warmupLimit(settings.warmup_started_on, normal)}</b>
                {settings.warmup_started_on ? ` (started ${settings.warmup_started_on})` : ' (starts with your next invite)'}.
              </>
            ) : null}
          </p>
        </section>

        <section aria-labelledby="fu-h" className="border-t border-slate-100 pt-5">
          <p className="text-sm font-medium text-slate-900" id="fu-h">
            Follow-ups
          </p>
          <p className="mt-1 text-xs text-slate-500">
            When someone has not written back, the AI writes a short follow-up. It never goes to people who replied, and for
            connection requests only after they accept. Replies to people who wrote back always wait for your approval.
          </p>
          <div className="mt-3 space-y-2 text-sm" role="radiogroup" aria-label="Follow-up sending">
            <label className="flex items-start gap-2">
              <input type="radio" name="fu-mode" className="mt-1" checked={draft.followup_mode === 'approve'} onChange={() => set({ followup_mode: 'approve' })} />
              <span>
                <b>I approve each one</b> — follow-ups wait in Message Studio → Follow-ups.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="fu-mode" className="mt-1" checked={draft.followup_mode === 'auto'} onChange={() => set({ followup_mode: 'auto' })} />
              <span>
                <b>Send automatically</b> — they go straight into the send queue (the extension still respects your working hours and limits).
              </span>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              Follow-ups
              <select className="input w-16 py-1" value={draft.followup_days.length} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {draft.followup_days.map((d, i) => (
              <label key={i} className="flex items-center gap-1.5">
                {i === 0 ? '· 1st after' : `· ${i === 1 ? '2nd' : '3rd'} after`}
                <input
                  type="number"
                  min={1}
                  max={30}
                  className="input w-16 py-1"
                  value={Number.isFinite(d) ? d : ''}
                  onChange={(e) => setDay(i, Math.round(Number(e.target.value)))}
                  aria-label={`Days before follow-up ${i + 1}`}
                />
                days
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            The 1st counts from your first message; after a connection request, a short “thanks for connecting” goes as soon as they accept. Each next one counts from the follow-up before it.
          </p>
          {daysBad ? <p className="text-xs text-red-700">Each wait must be 1 to 30 days.</p> : null}
        </section>

        <section className="border-t border-slate-100 pt-5">
          <p className="text-sm font-medium text-slate-900">Safety</p>
          <p className="mt-1 text-xs text-slate-500">
            If LinkedIn shows a security check or warning, the extension stops at once and automatic runs pause for 24 hours. A run
            also stops after 3 failures in a row.
          </p>
          <p className="mt-2 text-sm">
            {paused ? (
              <span className="text-red-800">🛑 Paused until {formatDateTime(settings!.safety_paused_until)}.</span>
            ) : (
              <span className="text-emerald-800">✓ Not paused{settings?.last_warning_at ? ` (last warning ${formatDateTime(settings.last_warning_at)})` : ''}.</span>
            )}
          </p>
        </section>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
          <button type="button" className="btn-primary" disabled={saving || invalid} onClick={() => void onSave()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved ? <span className="text-xs text-good">Saved. The extension picks it up within 30 minutes (or reload LinkedIn).</span> : null}
        </div>
        {saveErr ? <InlineError error={saveErr} /> : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Settings card: the morning email (Batch C)
// ---------------------------------------------------------------------------
export function MorningEmailCard() {
  const { user } = useAuth();
  const { settings, missing, loading, save } = useAutomation();
  const [on, setOn] = useState<boolean | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<FriendlyError | null>(null);
  if (loading || missing || !settings) return null;
  if (!settings.batch_c) {
    return (
      <Card title="Morning email">
        <p className="text-sm text-slate-600">This needs the latest database update (Batch C). Ask your administrator to run it, then reload this page.</p>
      </Card>
    );
  }
  const curOn = on ?? settings.digest_on;
  const curHour = hour ?? settings.digest_hour;
  const changed = curOn !== settings.digest_on || curHour !== settings.digest_hour;
  const onSave = async () => {
    setBusy(true);
    setErr(null);
    setNote(null);
    const e = await save({ digest_on: curOn, digest_hour: curHour });
    setBusy(false);
    if (e) setErr(e);
    else {
      setOn(null);
      setHour(null);
      setNote('Saved.');
    }
  };
  const onTest = async () => {
    if (!user) return;
    setBusy(true);
    setErr(null);
    setNote(null);
    const e = await sendTestDigest(user.id);
    setBusy(false);
    if (e) setErr(e);
    else setNote(`Test email sent to ${user.email ?? 'you'}. Check your inbox (and spam).`);
  };
  const fmt = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;
  return (
    <Card title="Morning email" description="Your “Today” list by email: who wrote back, follow-ups to approve, failed sends, and anything blocking your automation.">
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-slate-900">
          <input type="checkbox" checked={curOn} onChange={(e) => setOn(e.target.checked)} />
          Send me the morning email
        </label>
        <label className="flex items-center gap-2">
          At
          <select className="input w-32 py-1" aria-label="Morning email time" value={curHour} disabled={!curOn} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {fmt(h)}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">your time ({settings.work_tz}), on your working days. Only sent when there is something to do.</span>
        </label>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className="btn-primary" disabled={busy || !changed} onClick={() => void onSave()}>
            Save email settings
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void onTest()}>
            {busy ? 'Working…' : 'Send me a test email now'}
          </button>
          {note ? <span className="text-xs text-good">{note}</span> : null}
        </div>
        {err ? <InlineError error={err} /> : null}
      </div>
    </Card>
  );
}

