import { LanguagePickers, Translation } from '../components/Languages';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAutomation } from '../components/Automation';
import { Card, EmptyState, ErrorState, InlineError, PageHeader, SkeletonCards } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import { guessTimeZone, timeZones } from '../lib/automation';
import {
  MAX_POST,
  POST_LANGUAGES,
  PREVIEW_CHARS,
  deletePost,
  disconnectLinkedIn,
  formatInZone,
  loadPostAbout,
  loadPosts,
  loadPublishState,
  publishNow,
  rememberPostLanguage,
  retryPost,
  savePost,
  savePostAbout,
  savedPostLanguage,
  startLinkedInConnect,
  utcToZoned,
  writePosts,
  zonedToUtc,
  type LinkedInConnection,
  type ScheduledPost,
} from '../lib/publish';
import type { FriendlyError } from '../lib/supabase';

const DAY = 86400000;
const TONES = ['Professional', 'Friendly', 'Inspiring', 'Storytelling', 'Bold', 'Educational'];
const BACK_REASONS: Record<string, string> = {
  cancelled: 'You cancelled on LinkedIn. Nothing was connected.',
  expired: 'That sign-in link was too old or already used. Press “Connect LinkedIn” again.',
  not_set_up: 'LinkedIn is not set up yet. Your administrator needs to add the LinkedIn app keys.',
  token_failed: 'LinkedIn did not accept the sign-in.',
  profile_failed: 'Connected, but LinkedIn did not share your profile. Try again.',
  save_failed: 'The connection could not be saved. Try again.',
};

// ---------------------------------------------------------------------------
// Your LinkedIn
// ---------------------------------------------------------------------------
function ConnectionCard({
  ready,
  conn,
  onChanged,
}: {
  ready: boolean;
  conn: LinkedInConnection | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [params, setParams] = useSearchParams();
  const back = params.get('linkedin');
  const reason = params.get('reason') ?? '';
  const detail = params.get('detail');

  const connect = async () => {
    setBusy(true);
    setErr(null);
    const e = await startLinkedInConnect();
    if (e) {
      setErr(e);
      setBusy(false);
    }
  };
  const disconnect = async () => {
    setBusy(true);
    const e = await disconnectLinkedIn();
    setBusy(false);
    if (e) setErr(e);
    else onChanged();
  };
  const daysLeft = conn ? Math.max(0, Math.floor((new Date(conn.expires_at).getTime() - Date.now()) / DAY)) : 0;
  const expired = conn?.status === 'expired';
  const clearBack = () => {
    params.delete('linkedin');
    params.delete('reason');
    params.delete('detail');
    setParams(params, { replace: true });
  };

  return (
    <Card title="Your LinkedIn" description="Posts go out on your own LinkedIn profile, through LinkedIn's official API (no browser needed).">
      {back === 'connected' ? (
        <p className="mb-4 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          ✓ LinkedIn connected. You can schedule posts now.
          <button type="button" className="text-xs underline" onClick={clearBack}>
            OK
          </button>
        </p>
      ) : back === 'error' ? (
        <div className="mb-4" role="alert">
          <InlineError
            title="Not connected"
            error={{ message: BACK_REASONS[reason] ?? (reason.startsWith('linkedin_') ? `LinkedIn said: ${reason.slice(9).replace(/_/g, ' ')}.` : 'LinkedIn did not connect.'), hint: detail, code: null }}
          />
        </div>
      ) : null}
      {!ready ? (
        <p className="text-sm text-slate-600">
          LinkedIn posting is not switched on yet. Your administrator needs to add the LinkedIn app keys once (see the setup notes); then a
          “Connect LinkedIn” button appears here.
        </p>
      ) : !conn ? (
        <div className="flex flex-wrap items-center gap-4">
          <p className="max-w-xl text-sm text-slate-600">
            Connect once: LinkedIn asks you to allow Impact Connect to post for you. Your LinkedIn password never comes here, and you can
            disconnect any time.
          </p>
          <button type="button" className="btn-primary" onClick={() => void connect()} disabled={busy}>
            {busy ? 'Opening LinkedIn…' : 'Connect LinkedIn'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {conn.picture ? (
            <img src={conn.picture} alt="" className="h-12 w-12 rounded-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : null}
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{conn.name ?? 'LinkedIn account'}</p>
            <p className="text-xs text-slate-500">{conn.email}</p>
            {expired ? (
              <p className="mt-1 text-xs font-medium text-red-700">Connection expired. Reconnect so scheduled posts can go out.</p>
            ) : (
              <p className={`mt-1 text-xs ${daysLeft <= 10 ? 'font-medium text-amber-800' : 'text-slate-600'}`}>
                ✓ Connected · LinkedIn asks you to reconnect in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                {daysLeft <= 10 ? ' — reconnect now so nothing is missed' : ''}
              </p>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" className={expired || daysLeft <= 10 ? 'btn-primary' : 'btn-secondary'} onClick={() => void connect()} disabled={busy}>
              Reconnect
            </button>
            <button type="button" className="btn-secondary" onClick={() => void disconnect()} disabled={busy}>
              Disconnect
            </button>
          </div>
        </div>
      )}
      {err ? (
        <div className="mt-3">
          <InlineError error={err} title="LinkedIn" />
        </div>
      ) : null}
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
        Company Page posts: coming once LinkedIn approves Impact Connect for Page posting.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Write + schedule
// ---------------------------------------------------------------------------
function AboutYou() {
  const { user, clientId } = useAuth();
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState<FriendlyError | null>(null);
  useEffect(() => {
    if (!user) return;
    void loadPostAbout(user.id).then((v) => {
      setSaved(v);
      setText(v ?? '');
      if (v === '') setOpen(true); // first visit: show it
    });
  }, [user]);
  if (saved === null) return null;
  const save = async () => {
    if (!user) return;
    setBusy(true);
    setErr(null);
    const e = await savePostAbout(user.id, clientId, text);
    setBusy(false);
    if (e) return setErr(e);
    setSaved(text.trim());
    setMsg('Saved. The AI uses this in every post.');
  };
  return (
    <div className="mb-3">
      <button type="button" className="text-xs font-medium text-brand-700 underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} About you {saved ? '(saved)' : '— tell the AI who you are'}
      </button>
      {open ? (
        <div className="mt-2">
          <textarea
            className="input min-h-[80px] w-full"
            aria-label="About you"
            maxLength={3000}
            placeholder="e.g. I'm an AI automation engineer and n8n workflow specialist in Toronto. I build lead-generation and follow-up systems for small businesses. I write in a friendly, no-jargon way."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setMsg('');
            }}
          />
          <div className="mt-1 flex items-center gap-3">
            <button type="button" className="btn-secondary py-1 text-xs" onClick={() => void save()} disabled={busy || text.trim() === (saved ?? '')}>
              {busy ? 'Saving…' : 'Save about me'}
            </button>
            <span className="text-xs text-slate-500">{msg || 'Your work, who you help, a few real results — the AI only uses what you write here.'}</span>
          </div>
          {err ? <InlineError error={err} title="Not saved" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function defaultSlot(tz: string) {
  const t = utcToZoned(new Date(Date.now() + DAY), tz);
  return { date: t.date, time: '09:00' };
}

function Composer({
  tz,
  onTz,
  connected,
  editing,
  onDone,
}: {
  tz: string;
  onTz: (tz: string) => Promise<FriendlyError | null>;
  connected: boolean;
  editing: ScheduledPost | null;
  onDone: (msg: string) => void;
}) {
  const zones = useMemo(() => timeZones(), []);
  const [tzErr, setTzErr] = useState<FriendlyError | null>(null);
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [slot, setSlot] = useState(() => defaultSlot(tz));
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Professional');
  const [length, setLength] = useState('medium');
  const [language, setLanguage] = useState(savedPostLanguage);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);

  useEffect(() => {
    if (editing) {
      setBody(editing.body);
      setSlot(utcToZoned(editing.scheduled_at, tz));
      setErr(null);
    }
  }, [editing, tz]);
  useEffect(() => {
    if (!editing) setSlot(defaultSlot(tz));
  }, [tz, editing]);

  const when = slot.date && slot.time ? zonedToUtc(slot.date, slot.time, tz) : null;
  const past = !!when && when.getTime() < Date.now() - 60000;
  const tooLong = body.length > MAX_POST;
  const empty = !body.trim();

  const write = async (improve: boolean) => {
    if (!user) return;
    setWriting(true);
    setErr(null);
    const r = await writePosts(user.id, { topic, tone: tone.toLowerCase(), length, language, draft: improve ? body : undefined });
    setWriting(false);
    if (r.error) return setErr(r.error);
    setDrafts(r.posts);
  };
  const reset = () => {
    setBody('');
    setDrafts([]);
    setTopic('');
    setSlot(defaultSlot(tz));
  };
  const save = async (mode: 'schedule' | 'draft' | 'now') => {
    if (empty || tooLong) return;
    if (mode === 'schedule' && (!when || past)) return;
    setBusy(true);
    setErr(null);
    const at = mode === 'now' ? new Date() : when ?? new Date();
    const e = await savePost({ body, scheduled_at: at.toISOString(), tz, status: mode === 'draft' ? 'draft' : 'scheduled' }, editing?.id);
    if (e) {
      setBusy(false);
      return setErr(e);
    }
    if (mode === 'now') await publishNow();
    setBusy(false);
    reset();
    onDone(mode === 'now' ? 'Posting now…' : mode === 'draft' ? 'Saved as a draft.' : `Scheduled for ${formatInZone(at.toISOString(), tz)}.`);
  };

  return (
    <Card title={editing ? 'Edit post' : 'Write a post'} description="Write it yourself or let the AI draft it, then pick the day and time.">
      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <AboutYou />
        <label className="block text-xs font-medium text-slate-600" htmlFor="pub-topic">
          ✨ What should the post be about?
        </label>
        <textarea
          id="pub-topic"
          className="input mt-1 min-h-[64px] w-full"
          placeholder="e.g. We placed 12 newcomer volunteers with Toronto charities this month — what we learned"
          value={topic}
          maxLength={1500}
          onChange={(e) => setTopic(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <select className="input w-auto py-1" aria-label="Tone" value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className="input w-auto py-1" aria-label="Length" value={length} onChange={(e) => setLength(e.target.value)}>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
          <select
            className="input w-auto py-1"
            aria-label="Language"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              rememberPostLanguage(e.target.value);
            }}
          >
            {POST_LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
            <option value="auto">Same as the topic</option>
          </select>
          <button type="button" className="btn-primary py-1.5" onClick={() => void write(false)} disabled={writing || !topic.trim()}>
            {writing ? 'Writing…' : 'Write 3 versions'}
          </button>
          {body.trim() ? (
            <button type="button" className="btn-secondary py-1.5" onClick={() => void write(true)} disabled={writing}>
              Improve my text
            </button>
          ) : null}
        </div>
        <LanguagePickers show="translate" className="mt-3" />
        {drafts.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {drafts.map((d, i) => (
              <div key={i} className="flex flex-col rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 max-h-72 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-slate-700">{d}</p>
                <div className="mb-2 max-h-48 overflow-y-auto">
                  <Translation text={d} lang={language === 'auto' ? null : language} />
                </div>
                <button
                  type="button"
                  className="btn-secondary mt-auto py-1 text-xs"
                  aria-label={`Use version ${i + 1}`}
                  onClick={() => {
                    setBody(d);
                    setDrafts([]);
                  }}
                >
                  Use this
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <label className="block text-xs font-medium text-slate-600" htmlFor="pub-body">
        Post
      </label>
      <textarea
        id="pub-body"
        className="input mt-1 min-h-[220px] w-full font-[inherit] leading-relaxed"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Your post. The first two lines show before “…see more”, so make them count."
      />
      <Translation text={body} />
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs">
        <span className={tooLong ? 'font-medium text-red-700' : 'text-slate-500'}>
          {body.length.toLocaleString()} / {MAX_POST.toLocaleString()}
        </span>
        {body.length > PREVIEW_CHARS ? <span className="text-slate-500">Readers see the first ~{PREVIEW_CHARS} characters before “…see more”.</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Day</span>
          <input type="date" className="input w-auto py-1.5" value={slot.date} onChange={(e) => setSlot((s) => ({ ...s, date: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Time</span>
          <input type="time" className="input w-auto py-1.5" value={slot.time} onChange={(e) => setSlot((s) => ({ ...s, time: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Your time zone</span>
          <select
            className="input w-auto max-w-[16rem] py-1.5"
            aria-label="Your time zone"
            value={tz}
            onChange={(e) => {
              setTzErr(null);
              void onTz(e.target.value).then(setTzErr);
            }}
          >
            {(zones.includes(tz) ? zones : [tz, ...zones]).map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-500">The day and time are in this time zone. It is the same setting as in Settings (working hours, invite day, morning email).</p>
      {tzErr ? <InlineError error={tzErr} title="Time zone not saved" /> : null}
      {past ? <p className="mt-1 text-xs text-red-700">That time has passed. Pick a later time, or use “Post now”.</p> : null}
      <p className="mt-1 text-xs text-slate-500">Weekday mornings (8–10 am) and lunchtime usually get the most views.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => void save('schedule')} disabled={busy || empty || tooLong || past || !connected}>
          {editing ? 'Save and schedule' : 'Schedule post'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => void save('draft')} disabled={busy || empty || tooLong}>
          Save as draft
        </button>
        <button type="button" className="btn-secondary" onClick={() => void save('now')} disabled={busy || empty || tooLong || !connected}>
          Post now
        </button>
        {editing ? (
          <button type="button" className="btn-secondary" onClick={() => { reset(); onDone(''); }}>
            Cancel edit
          </button>
        ) : null}
      </div>
      {!connected ? <p className="mt-2 text-xs text-amber-800">Connect LinkedIn above to schedule or post. You can save drafts already.</p> : null}
      {err ? (
        <div className="mt-3">
          <InlineError error={err} title="Not saved" />
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------
const TABS: Array<[string, string, (p: ScheduledPost) => boolean]> = [
  ['scheduled', 'Scheduled', (p) => p.status === 'scheduled' || p.status === 'publishing'],
  ['draft', 'Drafts', (p) => p.status === 'draft' || p.status === 'cancelled'],
  ['published', 'Published', (p) => p.status === 'published'],
  ['failed', 'Failed', (p) => p.status === 'failed'],
];

function PostList({
  posts,
  tz,
  onEdit,
  onChanged,
}: {
  posts: ScheduledPost[];
  tz: string;
  onEdit: (p: ScheduledPost) => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState(() => (posts.some((p) => p.status === 'failed') ? 'failed' : 'scheduled'));
  const [err, setErr] = useState<FriendlyError | null>(null);
  const show = TABS.find((t) => t[0] === tab)![2];
  const rows = posts.filter(show).sort((a, b) => (tab === 'scheduled' ? a.scheduled_at.localeCompare(b.scheduled_at) : b.scheduled_at.localeCompare(a.scheduled_at)));
  const act = async (f: () => Promise<FriendlyError | null>) => {
    setErr(null);
    const e = await f();
    if (e) setErr(e);
    onChanged();
  };
  return (
    <Card title="Your posts">
      <div role="tablist" className="mb-4 flex flex-wrap gap-1">
        {TABS.map(([k, label, f]) => {
          const n = posts.filter(f).length;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`rounded-full px-3 py-1.5 text-sm ${tab === k ? 'bg-ink text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              onClick={() => setTab(k)}
            >
              {label} {n ? <span className={k === 'failed' && tab !== k ? 'font-semibold text-red-700' : ''}>({n})</span> : null}
            </button>
          );
        })}
      </div>
      {err ? (
        <div className="mb-3">
          <InlineError error={err} />
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {tab === 'scheduled' ? 'Nothing scheduled. Write a post above and pick a time.' : tab === 'draft' ? 'No drafts.' : tab === 'published' ? 'Nothing published yet.' : 'Nothing failed.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <div className="w-44 shrink-0 text-xs text-slate-500">
                <p className="font-medium text-slate-800">
                  {p.status === 'published' && p.published_at ? formatInZone(p.published_at, tz) : formatInZone(p.scheduled_at, tz)}
                </p>
                <p>
                  {p.status === 'publishing' ? 'Posting…' : p.status === 'published' ? 'Published' : p.status === 'failed' ? 'Failed' : p.status === 'scheduled' ? 'Scheduled' : 'Draft'}
                </p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 whitespace-pre-line text-sm text-slate-800">{p.body}</p>
                {p.status === 'failed' && p.error ? <p className="mt-1 text-xs text-red-700">{p.error}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {p.status === 'published' && p.post_url ? (
                  <a className="btn-secondary py-1 text-xs" href={p.post_url} target="_blank" rel="noreferrer">
                    Open on LinkedIn
                  </a>
                ) : null}
                {p.status === 'failed' ? (
                  <button type="button" className="btn-primary py-1 text-xs" onClick={() => void act(async () => { const e = await retryPost(p.id); if (!e) await publishNow(); return e; })}>
                    Retry now
                  </button>
                ) : null}
                {p.status !== 'published' && p.status !== 'publishing' ? (
                  <button type="button" className="btn-secondary py-1 text-xs" onClick={() => onEdit(p)}>
                    Edit
                  </button>
                ) : null}
                {p.status !== 'publishing' ? (
                  <button
                    type="button"
                    className="btn-secondary py-1 text-xs"
                    aria-label={p.status === 'published' ? 'Remove from list' : 'Delete'}
                    onClick={() => void act(() => deletePost(p.id))}
                  >
                    {p.status === 'published' ? 'Remove from list' : 'Delete'}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {tab === 'published' && rows.length ? (
        <p className="mt-3 text-xs text-slate-500">“Remove from list” only removes it here; the post stays on LinkedIn.</p>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function PublishPage() {
  const { settings, save } = useAutomation();
  const tz = settings?.work_tz || guessTimeZone();
  const [state, setState] = useState<{ ready: boolean; connection: LinkedInConnection | null } | null>(null);
  const [posts, setPosts] = useState<ScheduledPost[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [editing, setEditing] = useState<ScheduledPost | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([loadPublishState(), loadPosts()]);
    if (s.missing || p.missing) return setMissing(true);
    if (s.error) return setError(s.error);
    if (p.error) return setError(p.error);
    setError(null);
    setState(s.data);
    setPosts(p.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // while something is going out, look again every few seconds
  const busy = useMemo(() => (posts ?? []).some((p) => p.status === 'publishing' || (p.status === 'scheduled' && new Date(p.scheduled_at).getTime() <= Date.now())), [posts]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  const connected = !!state?.connection && state.connection.status === 'connected' && new Date(state.connection.expires_at).getTime() > Date.now();

  return (
    <>
      <PageHeader title="Publish" description="Write LinkedIn posts with AI and schedule them for your profile. They go out on time, even when your computer is off." />
      {missing ? (
        <EmptyState title="Publishing is not set up yet">Your administrator needs to run the Batch E database step (release 4.30).</EmptyState>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : !state || !posts ? (
        <SkeletonCards count={3} />
      ) : (
        <div className="space-y-6">
          <ConnectionCard ready={state.ready} conn={state.connection} onChanged={() => void load()} />
          {note ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              {note}
            </p>
          ) : null}
          <Composer
            tz={tz}
            onTz={(z) => save({ work_tz: z })}
            connected={connected}
            editing={editing}
            onDone={(msg) => {
              setEditing(null);
              setNote(msg);
              void load();
            }}
          />
          <PostList
            posts={posts}
            tz={tz}
            onEdit={(p) => {
              setEditing(p);
              setNote('');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onChanged={() => void load()}
          />
        </div>
      )}
    </>
  );
}
