import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../data/AuthProvider';
import { COMMENT_LANGUAGES } from '../lib/comments';
import { useExtensionTask } from '../lib/extensionBridge';
import { formatDateTime } from '../lib/format';
import {
  REPLY_CHAR_LIMIT,
  REPLY_DEFAULTS,
  REPLY_PROMPT_LIMIT,
  SKIP_WORDS_LIMIT,
  SOURCE_LABEL,
  checkRepliesNow,
  loadReplies,
  loadReplySettings,
  replyAction,
  repliesChanged,
  saveReplySettings,
  writeReplyDrafts,
  type CommentReply,
  type ReplyAction,
  type ReplySettings,
  type ReplyStatus,
} from '../lib/replies';
import type { FriendlyError } from '../lib/supabase';
import { Card, EmptyState, ErrorState, InlineError, SkeletonCards } from './ui';

type RTab = 'review' | 'waiting' | 'queue' | 'posted' | 'skipped' | 'failed';
const RTABS: Array<{ key: RTab; label: string; statuses: ReplyStatus[] }> = [
  { key: 'review', label: 'To review', statuses: ['drafted'] },
  { key: 'waiting', label: 'AI writing', statuses: ['new', 'drafting'] },
  { key: 'queue', label: 'Queued', statuses: ['queued', 'posting'] },
  { key: 'posted', label: 'Posted', statuses: ['posted'] },
  { key: 'skipped', label: 'Skipped', statuses: ['skipped'] },
  { key: 'failed', label: 'Failed', statuses: ['failed'] },
];
const REFRESH_MS = 20000;

function versionAtLeast(v: string | null, want: number[]): boolean {
  if (!v) return false;
  const p = v.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < want.length; i++) {
    if ((p[i] ?? 0) !== want[i]) return (p[i] ?? 0) > want[i];
  }
  return true;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
function Toggle({ id, label, help, checked, onChange, disabled }: {
  id: string; label: string; help: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label htmlFor={id} className={`flex items-start gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{help}</span>
      </span>
    </label>
  );
}

function NumberField({ id, label, help, value, min, max, onChange }: {
  id: string; label: string; help: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} type="number" className="input mt-1 w-28" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} />
      <p className="mt-1 text-xs text-slate-500">{help}</p>
    </div>
  );
}

function ReplySettingsCard({ userId, clientId, onSaved }: { userId: string; clientId: string | null; onSaved: (s: ReplySettings) => void }) {
  const [s, setS] = useState<ReplySettings>(REPLY_DEFAULTS);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  useEffect(() => {
    let live = true;
    void loadReplySettings(userId).then((r) => {
      if (!live) return;
      if (r.error) setError(r.error);
      else {
        setS(r.data);
        onSaved(r.data);
        if (!r.data.rp_on) setOpen(true);
      }
      setLoaded(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const set = <K extends keyof ReplySettings>(k: K, v: ReplySettings[K]) => {
    setS((x) => ({ ...x, [k]: v }));
    setSaved(false);
  };
  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await saveReplySettings(userId, clientId, s);
    if (r.error) setError(r.error);
    else {
      setSaved(true);
      onSaved(s);
    }
    setSaving(false);
  };

  const summary = !loaded
    ? 'Loading…'
    : s.rp_on
      ? `On — looks every ${s.rp_every_hours} h at ${[s.rp_own_posts && 'comments on your posts', s.rp_my_comments && 'replies to your comments'].filter(Boolean).join(' and ') || 'nothing (pick a place below)'}. ` +
        (s.rp_auto_send ? 'Replies go out by themselves.' : 'You approve each reply.')
      : 'Off — the extension does not look for new comments. You can still reply to a comment from Conversations.';

  return (
    <Card
      title="Reply settings"
      description={summary}
      actions={<button type="button" className="btn-secondary" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Edit'}</button>}
      className="mb-6"
    >
      {open ? (
        <div className="space-y-5">
          <Toggle id="rp-on" label="Look for new comments to reply to"
            help="The extension checks LinkedIn in the background (a small window, like the inbox check) and the AI drafts a reply for each new comment."
            checked={s.rp_on} onChange={(v) => set('rp_on', v)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Toggle id="rp-own" label="Comments on my posts" help="People who comment on the posts you published." checked={s.rp_own_posts}
              onChange={(v) => set('rp_own_posts', v)} disabled={!s.rp_on} />
            <Toggle id="rp-mine" label="Replies to my comments" help="Someone answered a comment you left on another post (from your notifications)."
              checked={s.rp_my_comments} onChange={(v) => set('rp_my_comments', v)} disabled={!s.rp_on} />
            <Toggle id="rp-leads" label="Send commenters to People Search"
              help="People who comment on your posts are warm: they are added to People Search as “Commented on your post”."
              checked={s.rp_add_leads} onChange={(v) => set('rp_add_leads', v)} disabled={!s.rp_on} />
            <Toggle id="rp-auto" label="Post replies by themselves (no review)"
              help="Each AI draft is queued at once and the Comment Assistant posts it. Leave off to approve each reply here."
              checked={s.rp_auto_send} onChange={(v) => set('rp_auto_send', v)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField id="rp-every" label="Look every (hours)" help="1 – 24" value={s.rp_every_hours} min={1} max={24} onChange={(v) => set('rp_every_hours', v)} />
            <NumberField id="rp-days" label="Posts from the last (days)" help="Only your posts this new are checked. 1 – 60" value={s.rp_post_days} min={1} max={60}
              onChange={(v) => set('rp_post_days', v)} />
            <NumberField id="rp-max" label="New comments a check" help="At most this many new replies are drafted each time. 1 – 30" value={s.rp_max_per_check}
              min={1} max={30} onChange={(v) => set('rp_max_per_check', v)} />
          </div>
          <div>
            <label htmlFor="rp-prompt" className="label">Instructions for the AI (replies)</label>
            <p className="mt-1 text-xs text-slate-500">
              Your tone and what you offer, what to avoid. Empty = your comment prompt is used. The AI answers the person by name when it fits, never adds
              hashtags or links, and skips comments that need no answer (spam, a lone emoji).
            </p>
            <textarea id="rp-prompt" className="input mt-2 min-h-[120px]" maxLength={REPLY_PROMPT_LIMIT} value={s.rp_prompt ?? ''}
              onChange={(e) => set('rp_prompt', e.target.value)} placeholder="e.g. Warm and short. Thank them, answer the question, and invite a DM if they ask about pricing." />
            <p className="mt-1 text-right text-[11px] tabular-nums text-slate-400">{(s.rp_prompt ?? '').length} / {REPLY_PROMPT_LIMIT}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rp-skip" className="label">Never reply to comments with</label>
              <input id="rp-skip" className="input mt-1" maxLength={SKIP_WORDS_LIMIT} value={s.rp_skip_words ?? ''}
                onChange={(e) => set('rp_skip_words', e.target.value)} placeholder="crypto, follow me, DM for promo" />
              <p className="mt-1 text-xs text-slate-500">Words or phrases, separated by commas.</p>
            </div>
            <div>
              <label htmlFor="rp-lang" className="label">Reply language</label>
              <select id="rp-lang" className="input mt-1" value={s.rp_language} onChange={(e) => set('rp_language', e.target.value)}>
                {COMMENT_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.value === 'auto' ? 'Same language as the comment' : l.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-slate-500">Replies count toward your comment limits (a day and an hour) — see Settings → Limits.</p>
          {error ? <InlineError error={error} /> : null}
          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary" disabled={saving || !loaded} onClick={() => void save()}>{saving ? 'Saving…' : 'Save reply settings'}</button>
            {saved ? <span className="text-xs font-medium text-emerald-700">Saved.</span> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One reply
// ---------------------------------------------------------------------------
function ReplyRow({ r, text, onText, selected, onSelect, busy, onAction }: {
  r: CommentReply; text: string; onText: (t: string) => void; selected: boolean; onSelect: (v: boolean) => void;
  busy: boolean; onAction: (a: ReplyAction, text?: string) => void;
}) {
  const editable = ['drafted', 'failed', 'skipped', 'queued'].includes(r.status);
  const over = text.length > REPLY_CHAR_LIMIT;
  const canApprove = ['drafted', 'failed', 'skipped'].includes(r.status) && text.trim().length > 0 && !over;
  const changed = text.trim() !== (r.draft ?? '').trim();
  return (
    <li className="card p-4" data-reply-id={r.id}>
      <div className="flex items-start gap-3">
        {['drafted', 'failed'].includes(r.status) ? (
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300" checked={selected} onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select reply to ${r.author_name ?? 'comment'}`} />
        ) : null}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {r.author_url ? (
              <a href={r.author_url} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">{r.author_name || 'LinkedIn member'}</a>
            ) : (
              <span className="font-semibold text-slate-900">{r.author_name || 'LinkedIn member'}</span>
            )}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{SOURCE_LABEL[r.source]}</span>
            {r.lead_added ? <span className="rounded-full bg-sun-100 px-2 py-0.5 text-[11px] text-ink">In People Search</span> : null}
            <span className="text-xs text-slate-400">{formatDateTime(r.created_at)}</span>
            <a href={r.comment_url || r.post_url} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-brand-700 hover:underline">Open post ↗</a>
          </p>
          {r.author_headline ? <p className="line-clamp-1 text-xs text-slate-500">{r.author_headline}</p> : null}
          {r.post_text ? (
            <p className="line-clamp-2 text-xs text-slate-500">
              <span className="font-medium text-slate-600">Post{r.post_author ? ` by ${r.post_author}` : ''}:</span> {r.post_text}
            </p>
          ) : null}
          {r.my_comment_text ? (
            <p className="line-clamp-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
              <span className="font-medium">Your comment:</span> {r.my_comment_text}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">“{r.comment_text}”</p>
          {r.status === 'new' || r.status === 'drafting' ? (
            <p className="text-sm text-sky-800">The AI is writing a reply…</p>
          ) : editable ? (
            <div>
              <label className="sr-only" htmlFor={`rp-text-${r.id}`}>Your reply</label>
              <textarea id={`rp-text-${r.id}`} className="input min-h-[80px]" value={text} onChange={(e) => onText(e.target.value)}
                placeholder={r.status === 'skipped' ? 'Write a reply to post it anyway' : 'Your reply'} />
              <p className={`mt-1 text-right text-[11px] tabular-nums ${over ? 'font-medium text-red-700' : 'text-slate-400'}`}>
                {text.length.toLocaleString()} / {REPLY_CHAR_LIMIT.toLocaleString()}
              </p>
            </div>
          ) : r.draft ? (
            <p className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">↳ {r.draft}</p>
          ) : null}
          {r.status === 'skipped' && r.skip_reason ? <p className="text-xs text-slate-500">Skipped: {r.skip_reason}</p> : null}
          {r.status === 'failed' && r.error ? <p className="text-xs text-red-700">Could not post: {r.error}</p> : null}
          {r.status === 'posted' && r.posted_at ? <p className="text-xs text-emerald-700">Posted {formatDateTime(r.posted_at)}</p> : null}
          <div className="flex flex-wrap gap-2">
            {canApprove ? (
              <button type="button" className="btn-primary" disabled={busy} onClick={() => onAction('approve', text)}>
                {r.status === 'failed' ? 'Try again' : 'Approve & queue'}
              </button>
            ) : null}
            {editable && changed && text.trim() && !over ? (
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => onAction('save', text)}>Save text</button>
            ) : null}
            {['drafted', 'skipped', 'failed', 'queued'].includes(r.status) ? (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAction('redraft')}>Write again</button>
            ) : null}
            {r.status === 'queued' ? (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAction('unqueue')}>Take out of the queue</button>
            ) : null}
            {['new', 'drafted', 'queued', 'failed'].includes(r.status) ? (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAction('skip')}>Skip</button>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------
export function CommentRepliesView() {
  const { user, clientId } = useAuth();
  const userId = user?.id ?? null;
  const extension = useExtensionTask();
  const [rows, setRows] = useState<CommentReply[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<RTab>('review');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReplySettings | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const r = await loadReplies();
    if (r.error) setLoadError(r.error);
    else {
      setLoadError(null);
      setRows(r.data);
    }
    setLoaded(true);
    inFlight.current = false;
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const counts = useMemo(() => {
    const c = {} as Record<RTab, number>;
    for (const t of RTABS) c[t.key] = rows.filter((r) => t.statuses.includes(r.status)).length;
    return c;
  }, [rows]);
  const visible = useMemo(() => rows.filter((r) => RTABS.find((t) => t.key === tab)!.statuses.includes(r.status)), [rows, tab]);
  const textOf = (r: CommentReply) => edits[r.id] ?? r.draft ?? '';
  const selectable = visible.filter((r) => ['drafted', 'failed'].includes(r.status) && textOf(r).trim() && textOf(r).length <= REPLY_CHAR_LIMIT);
  const pickedInView = selectable.filter((r) => selected.has(r.id));

  const afterQueue = (n: number) => {
    if (!n) return;
    if (extension.status === 'connected') extension.chooseTask('comment_poster');
    setNotice(
      `${n} ${n === 1 ? 'reply is' : 'replies are'} queued. ` +
        (extension.status === 'connected'
          ? 'The Comment Assistant posts them on LinkedIn (with ⚡ on, by itself), inside your comment limits.'
          : 'Open LinkedIn with the extension and choose Comment Assistant to post them.'),
    );
  };

  const act = async (ids: string[], action: ReplyAction, text?: string) => {
    setBusy(ids.length === 1 ? ids[0] : 'bulk');
    setError(null);
    const r = await replyAction(ids, action, text);
    if (r.error) setError(r.error);
    else {
      if (action === 'approve') afterQueue(r.data);
      if (action === 'redraft' && userId) {
        const e = await writeReplyDrafts(userId);
        if (e) setError(e);
      }
      setEdits((x) => {
        const y = { ...x };
        ids.forEach((id) => delete y[id]);
        return y;
      });
      setSelected(new Set());
      repliesChanged();
    }
    await load();
    setBusy(null);
    if (action === 'redraft') window.setTimeout(() => void load(), 6000);
  };

  const approveSelected = async () => {
    setBusy('bulk');
    setError(null);
    let n = 0;
    for (const r of pickedInView) {
      const changed = textOf(r).trim() !== (r.draft ?? '').trim();
      const res = await replyAction([r.id], 'approve', changed ? textOf(r) : undefined);
      if (res.error) {
        setError(res.error);
        break;
      }
      n += res.data;
    }
    afterQueue(n);
    setSelected(new Set());
    setEdits({});
    repliesChanged();
    await load();
    setBusy(null);
  };

  const writeNow = async () => {
    if (!userId) return;
    setBusy('write');
    setError(null);
    const e = await writeReplyDrafts(userId);
    if (e) setError(e);
    else setNotice('The AI is writing the waiting replies — they appear under “To review” in a few seconds.');
    window.setTimeout(() => void load().then(() => setBusy(null)), 5000);
  };

  const lookNow = async () => {
    setBusy('look');
    setError(null);
    const r = await checkRepliesNow();
    if (r.error) setError(r.error);
    else if (!r.data) setNotice('Switch on “Look for new comments to reply to” in Reply settings first.');
    else
      setNotice(
        extension.status === 'connected' && versionAtLeast(extension.version, [4, 36])
          ? 'The extension is looking for new comments now (in a small LinkedIn window). New ones appear here when it is done.'
          : 'Asked. The extension looks for new comments the next time LinkedIn is open (extension 4.36 or newer).',
      );
    setBusy(null);
  };

  if (loadError) return <ErrorState error={loadError} onRetry={() => void load()} />;

  const waiting = counts.waiting;
  return (
    <>
      {userId ? <ReplySettingsCard userId={userId} clientId={clientId} onSaved={setSettings} /> : null}

      {extension.status === 'connected' && extension.version && !versionAtLeast(extension.version, [4, 36]) ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Your extension is {extension.version}. Replies need extension 4.36 or newer — update it to post replies and find new comments.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary" disabled={busy !== null || !settings?.rp_on} onClick={() => void lookNow()}
          title={settings?.rp_on ? 'The extension looks at your posts and notifications now' : 'Switch it on in Reply settings first'}>
          {busy === 'look' ? 'Asking…' : 'Look for new comments now'}
        </button>
        <button type="button" className="btn-secondary" disabled={busy !== null || !waiting} onClick={() => void writeNow()}>
          {busy === 'write' ? 'Writing…' : `Write the waiting replies${waiting ? ` (${waiting})` : ''}`}
        </button>
        {settings?.rp_last_check_at ? (
          <span className="text-xs text-slate-500">Last looked {formatDateTime(settings.rp_last_check_at)}</span>
        ) : null}
      </div>

      {notice ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900" role="status">
          <span>{notice}</span>
          <button type="button" className="btn-ghost" onClick={() => setNotice(null)}>Close</button>
        </div>
      ) : null}
      {error ? <div className="mb-4"><InlineError error={error} /></div> : null}

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-slate-200" role="tablist" aria-label="Replies">
        {RTABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            {t.label}
            <span className="ml-1.5 text-xs tabular-nums text-slate-400">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {selectable.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={pickedInView.length > 0 && pickedInView.length === selectable.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())} />
            Select all ({selectable.length})
          </label>
          <button type="button" className="btn-primary" disabled={!pickedInView.length || busy !== null} onClick={() => void approveSelected()}>
            {busy === 'bulk' ? 'Queuing…' : `Approve & queue ${pickedInView.length || ''}`.trim()}
          </button>
        </div>
      ) : null}

      {!loaded ? (
        <SkeletonCards count={3} />
      ) : visible.length === 0 ? (
        <EmptyState title={tab === 'review' ? 'No replies to review' : 'Nothing here'}>
          {tab === 'review'
            ? settings?.rp_on
              ? 'New comments on your posts and replies to your comments appear here with an AI draft. You can also reply to any collected comment from Conversations.'
              : 'Switch on “Look for new comments to reply to” above, or reply to a comment from Conversations (open a post → People → Reply).'
            : 'Nothing in this list right now.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <ReplyRow key={r.id} r={r} text={textOf(r)} onText={(t) => setEdits((x) => ({ ...x, [r.id]: t }))}
              selected={selected.has(r.id)}
              onSelect={(v) => setSelected((x) => { const y = new Set(x); if (v) y.add(r.id); else y.delete(r.id); return y; })}
              busy={busy !== null} onAction={(a, t) => void act([r.id], a, t)} />
          ))}
        </ul>
      )}
    </>
  );
}
