import { useEffect, useState } from 'react';
import { useAuth } from '../../data/AuthProvider';
import { DEFAULT_PLAN, WEEK_DAYS, loadPlan, requestPlanNow, savePlan, type ContentPlan } from '../../lib/contentPlan';
import { POST_LANGUAGES, formatInZone } from '../../lib/publish';
import type { FriendlyError } from '../../lib/supabase';
import { Card, InlineError } from '../ui';

const TONES = ['friendly and professional', 'professional', 'inspiring', 'storytelling', 'bold', 'educational'];

/**
 * Content autopilot: the member's plan. n8n writes the week's posts (with a picture) into "To review";
 * nothing is posted until the member approves each one.
 */
export function ContentAutopilot({
  tz,
  stockReady,
  onPlanned,
}: {
  tz: string;
  stockReady: boolean | null;
  onPlanned: () => void;
}) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [saved, setSaved] = useState<ContentPlan | null>(null);
  const [exists, setExists] = useState(false);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState<FriendlyError | null>(null);

  const reload = async () => {
    if (!user) return;
    const r = await loadPlan(user.id);
    if (r.missing) return setMissing(true);
    if (r.error) return setErr(r.error);
    const p = r.data ?? { ...DEFAULT_PLAN, tz };
    setPlan(p);
    setSaved(p);
    setExists(r.exists);
    if (!r.exists) setOpen(true);
  };
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  // while a plan was asked for, look again until n8n has written it
  const waiting = !!plan?.plan_requested_at && (!plan.last_planned_at || plan.plan_requested_at > plan.last_planned_at);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      void reload().then(onPlanned);
    }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  if (missing) return null;
  if (!plan || !saved) return null;
  const set = <K extends keyof ContentPlan>(k: K, v: ContentPlan[K]) => {
    setPlan({ ...plan, [k]: v });
    setMsg('');
  };
  const shape = (p: ContentPlan) =>
    JSON.stringify([p.enabled, p.topics, p.audience, p.goal, p.tone, p.length, p.language, p.posts_per_week, [...p.days].sort(), p.post_time, p.image_source]);
  const dirty = !exists || shape(plan) !== shape(saved) || saved.tz !== tz;
  const tooFewDays = plan.days.length < plan.posts_per_week;

  const save = async (andPlan: boolean) => {
    if (!user) return;
    setBusy(true);
    setErr(null);
    const e = await savePlan(user.id, { ...plan, tz }, exists);
    if (e) {
      setBusy(false);
      return setErr(e);
    }
    setExists(true);
    if (andPlan) {
      const e2 = await requestPlanNow(user.id);
      if (e2) {
        setBusy(false);
        return setErr(e2);
      }
      setMsg('Writing your posts… they appear under “To review” in a minute or two.');
    } else {
      setMsg(plan.enabled ? 'Saved. New posts are written once a day for the coming week.' : 'Saved. Autopilot is off.');
    }
    setBusy(false);
    await reload();
  };

  return (
    <Card
      title="Content autopilot"
      description="The AI writes your posts for the coming week, with a picture, and puts them in “To review”. Nothing is posted until you approve it."
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={plan.enabled} onChange={(e) => set('enabled', e.target.checked)} aria-label="Content autopilot on" />
          {plan.enabled ? 'On' : 'Off'}
        </label>
        <span className="text-xs text-slate-600" data-testid="plan-summary">
          {plan.posts_per_week} post{plan.posts_per_week === 1 ? '' : 's'} a week ·{' '}
          {WEEK_DAYS.filter(([d]) => plan.days.includes(d)).map(([, l]) => l).join(', ')} at {plan.post_time} ·{' '}
          {plan.image_source === 'ai' ? 'AI picture' : plan.image_source === 'stock' ? 'stock photo' : 'no picture'}
        </span>
        <button type="button" className="ml-auto text-xs font-medium text-brand-700 underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? '▾ Hide settings' : '▸ Settings'}
        </button>
      </div>
      {saved.last_planned_at ? (
        <p className="mt-2 text-xs text-slate-500" data-testid="plan-last">
          Last planned {formatInZone(saved.last_planned_at, tz)}
          {saved.last_result ? ` — ${saved.last_result}` : ''}
        </p>
      ) : null}

      {open ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-medium text-slate-600 md:col-span-2">
            Topics you want to post about
            <textarea
              className="input mt-1 min-h-[70px] w-full"
              maxLength={2000}
              placeholder="e.g. AI for small business owners; digital safety for newcomers; what we learn running free workshops"
              value={plan.topics}
              onChange={(e) => set('topics', e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Who the posts are for
            <input className="input mt-1 w-full" maxLength={1000} placeholder="e.g. small business owners and nonprofit leaders in Ontario" value={plan.audience} onChange={(e) => set('audience', e.target.value)} />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            What the posts should achieve
            <input className="input mt-1 w-full" maxLength={1000} placeholder="e.g. invite people to our free workshops; find volunteer experts" value={plan.goal} onChange={(e) => set('goal', e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-3 text-xs md:col-span-2">
            <label className="flex flex-col gap-1 font-medium text-slate-600">
              Tone
              <select className="input w-auto py-1" value={plan.tone} onChange={(e) => set('tone', e.target.value)}>
                {(TONES.includes(plan.tone) ? TONES : [plan.tone, ...TONES]).map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-600">
              Length
              <select className="input w-auto py-1" value={plan.length} onChange={(e) => set('length', e.target.value as ContentPlan['length'])}>
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-600">
              Language
              <select className="input w-auto py-1" value={plan.language} onChange={(e) => set('language', e.target.value)}>
                {(POST_LANGUAGES.includes(plan.language) ? POST_LANGUAGES : [plan.language, ...POST_LANGUAGES]).map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-600">
              Posts a week
              <select className="input w-auto py-1" value={plan.posts_per_week} onChange={(e) => set('posts_per_week', Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-medium text-slate-600">
              Time
              <input type="time" className="input w-auto py-1" value={plan.post_time} onChange={(e) => set('post_time', e.target.value || '09:00')} />
            </label>
          </div>
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-medium text-slate-600">Posting days (one post a day at most)</legend>
            <div className="mt-1 flex flex-wrap gap-1">
              {WEEK_DAYS.map(([d, l]) => {
                const on = plan.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    className={`rounded-full px-3 py-1 text-xs ${on ? 'bg-ink text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    onClick={() => set('days', on ? plan.days.filter((x) => x !== d) : [...plan.days, d].sort())}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            {tooFewDays ? (
              <p className="mt-1 text-[11px] text-amber-800">
                {plan.posts_per_week} posts a week need at least {plan.posts_per_week} posting days; only {plan.days.length} are picked.
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-slate-500">Times are in your time zone ({tz}).</p>
          </fieldset>
          <fieldset className="md:col-span-2">
            <legend className="text-xs font-medium text-slate-600">Picture with each post</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {(
                [
                  ['ai', '🎨 AI picture', 'drawn for each post'],
                  ['stock', '📷 Stock photo', 'free photos from Pexels'],
                  ['none', 'No picture', 'text only'],
                ] as const
              ).map(([v, l, d]) => (
                <label key={v} className="flex items-start gap-2">
                  <input type="radio" name="plan-image" className="mt-1" checked={plan.image_source === v} onChange={() => set('image_source', v)} />
                  <span>
                    {l}
                    <span className="block text-[11px] text-slate-500">{d}</span>
                  </span>
                </label>
              ))}
            </div>
            {plan.image_source === 'stock' && stockReady === false ? (
              <p className="mt-1 text-[11px] text-amber-800">Stock photos are not set up yet: your administrator needs to add the free Pexels key (see the setup notes).</p>
            ) : null}
            <p className="mt-1 text-[11px] text-slate-500">You can change the picture of any post when you review it.</p>
          </fieldset>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {open || dirty ? (
          <button type="button" className="btn-secondary" disabled={busy || !dirty} onClick={() => void save(false)}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        ) : null}
        <button
          type="button"
          className="btn-primary"
          disabled={busy || waiting || !plan.enabled || !plan.topics.trim() || plan.days.length === 0}
          onClick={() => void save(true)}
          title={!plan.enabled ? 'Switch autopilot on first' : !plan.topics.trim() ? 'Write your topics first' : undefined}
        >
          {waiting ? 'Writing your posts…' : 'Plan my week now'}
        </button>
        <span className="text-xs text-slate-500" role="status">
          {msg || (plan.enabled ? 'It also plans by itself once a day.' : 'Switch it on, write your topics, then plan.')}
        </span>
      </div>
      {err ? (
        <div className="mt-3">
          <InlineError error={err} title="Content autopilot" />
        </div>
      ) : null}
    </Card>
  );
}
