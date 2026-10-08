import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, EmptyState, ErrorState, InlineError, PageHeader, SkeletonCards } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import {
  COMMENT_LANGUAGES,
  DEFAULT_DAILY_LIMIT,
  cancelQueued,
  dismissPosts,
  hasPostLink,
  loadCommentPosts,
  loadCommentSettings,
  queueComments,
  requestDrafts,
  requestDraftsForAllNew,
  runDraftBatch,
  saveCommentSettings,
  saveDraftText,
} from '../lib/comments';
import { COMMENT_CHAR_LIMIT } from '../lib/constants';
import { useExtensionTask } from '../lib/extensionBridge';
import { formatDateTime } from '../lib/format';
import type { FriendlyError } from '../lib/supabase';
import type { CommentPost, CommentStatus } from '../lib/types';

const AUTO_REFRESH_MS = 10_000;

type TabKey = 'review' | 'new' | 'skipped' | 'queue' | 'posted' | 'failed' | 'all';

const TABS: Array<{ key: TabKey; label: string; statuses: CommentStatus[] | null }> = [
  { key: 'review', label: 'To review', statuses: ['drafted'] },
  { key: 'new', label: 'New', statuses: ['pending', 'draft_requested', 'drafting'] },
  { key: 'skipped', label: 'Skipped', statuses: ['skipped'] },
  { key: 'queue', label: 'Queued', statuses: ['queued', 'posting'] },
  { key: 'posted', label: 'Posted', statuses: ['posted'] },
  { key: 'failed', label: 'Failed', statuses: ['failed'] },
  { key: 'all', label: 'All', statuses: null },
];

const STATUS_LABEL: Record<CommentStatus, { text: string; tone: string }> = {
  pending: { text: 'Not drafted', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  draft_requested: { text: 'Waiting for AI', tone: 'border-sky-200 bg-sky-50 text-sky-800' },
  drafting: { text: 'AI is writing…', tone: 'border-sky-200 bg-sky-50 text-sky-800' },
  drafted: { text: 'Ready to review', tone: 'border-brand-200 bg-brand-50 text-brand-800' },
  skipped: { text: 'Skipped', tone: 'border-slate-200 bg-slate-100 text-slate-600' },
  queued: { text: 'Queued for LinkedIn', tone: 'border-amber-200 bg-amber-50 text-amber-900' },
  posting: { text: 'Posting now…', tone: 'border-amber-200 bg-amber-50 text-amber-900' },
  posted: { text: 'Posted', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  failed: { text: 'Failed', tone: 'border-red-200 bg-red-50 text-red-800' },
};

const DEFAULT_PROMPT_HINT =
  'Example: I run an AI automation agency for small businesses in Canada. Comment like a practitioner who has built these systems: add one concrete insight or ask one smart question. Warm, direct, no selling, never more than 3 sentences.';

function statusOf(p: CommentPost): CommentStatus {
  return (p.comment_status ?? 'pending') as CommentStatus;
}

// ---------------------------------------------------------------------------
// Prompt & language
// ---------------------------------------------------------------------------
export function CommentPromptPanel({
  userId,
  clientId,
  defaultOpen = false,
}: {
  userId: string;
  clientId: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState('auto');
  const [limit, setLimit] = useState(DEFAULT_DAILY_LIMIT);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadCommentSettings(userId).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else if (res.data) {
        setPrompt(res.data.comment_prompt ?? '');
        setLanguage(res.data.comment_language || 'auto');
        setLimit(res.data.daily_limit || DEFAULT_DAILY_LIMIT);
      }
      setLoaded(true);
      if (!res.error && !res.data?.comment_prompt) setOpen(true); // first visit: show it
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await saveCommentSettings(userId, clientId, prompt, language);
    if (res.error) setError(res.error);
    else setSaved(true);
    setSaving(false);
  };

  return (
    <Card
      title="Your comment prompt"
      description={
        loaded
          ? `${prompt.trim() ? 'Used for every comment the AI writes for you.' : 'Not set yet — a general default is used.'} Language: ${
              COMMENT_LANGUAGES.find((l) => l.value === language)?.label ?? language
            }. Limit: ${limit} comments per 24 hours.`
          : 'Loading…'
      }
      actions={
        <button type="button" className="btn-secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Edit'}
        </button>
      }
      className="mb-6"
    >
      {open ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="comment-prompt" className="label">
              Instructions for the AI
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Who you are, what you offer, who you want to reach, your tone, what to avoid. Any length.
              The AI always reacts to the specific post, never adds hashtags or links, and skips posts
              that aren't worth a comment.
            </p>
            <textarea
              id="comment-prompt"
              className="input mt-2 min-h-[220px] font-normal leading-relaxed"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setSaved(false);
              }}
              placeholder={DEFAULT_PROMPT_HINT}
            />
            <p className="mt-1 text-right text-[11px] tabular-nums text-slate-400">
              {prompt.length.toLocaleString()} characters
            </p>
          </div>
          <div className="max-w-sm">
            <label htmlFor="comment-language" className="label">
              Comment language
            </label>
            <select
              id="comment-language"
              className="input mt-2"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setSaved(false);
              }}
            >
              {COMMENT_LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          {error ? <InlineError error={error} /> : null}
          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving || !loaded}>
              {saving ? 'Saving…' : 'Save prompt'}
            </button>
            {saved ? <span className="text-xs font-medium text-emerald-700">Saved. New drafts will use it.</span> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One post with its comment
// ---------------------------------------------------------------------------
function CommentRow({
  post,
  text,
  selected,
  busy,
  onText,
  onBlurText,
  onToggle,
  onAction,
}: {
  post: CommentPost;
  text: string;
  selected: boolean;
  busy: boolean;
  onText: (value: string) => void;
  onBlurText: () => void;
  onToggle: () => void;
  onAction: (action: RowAction) => void;
}) {
  const [showPost, setShowPost] = useState(false);
  const status = statusOf(post);
  const label = STATUS_LABEL[status];
  const link = hasPostLink(post);
  const editable = status === 'drafted' || status === 'failed';
  const over = text.length > COMMENT_CHAR_LIMIT;
  const canPost = editable && link && text.trim().length > 0 && !over;
  const postText = post.post_text?.trim() ?? '';
  const whyNot = !editable
    ? null
    : !link
      ? 'No post link, so the extension cannot open this post. Scrape it again with the updated extension to add its link.'
      : !text.trim()
        ? 'Write a comment first.'
        : over
          ? 'Too long for LinkedIn.'
          : null;

  // Clicking anywhere on the card selects it, except on links, buttons and the text box.
  const onCardClick = (e: React.MouseEvent) => {
    if (!editable || !canPost || busy) return;
    if ((e.target as HTMLElement).closest('a, button, textarea, input, select, label')) return;
    onToggle();
  };

  return (
    <article
      className={`card p-4 ${editable && canPost ? 'cursor-pointer' : ''} ${
        selected ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500' : ''
      }`}
      onClick={onCardClick}
      aria-selected={editable ? selected : undefined}
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* The post */}
        <div className="min-w-0 lg:w-[42%] lg:shrink-0">
          <div className="flex items-start gap-3">
            {editable ? (
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-400 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed"
                checked={selected}
                onChange={onToggle}
                disabled={!canPost || busy}
                title={whyNot ?? undefined}
                aria-label={`Select comment for ${post.author_name ?? 'this post'}`}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                {post.author_linkedin_url ? (
                  <a
                    href={post.author_linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    {post.author_name || 'Unknown'}
                  </a>
                ) : (
                  <span className="text-sm font-medium text-slate-900">{post.author_name || 'Unknown'}</span>
                )}
                {link ? (
                  <a
                    href={post.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Open post ↗
                  </a>
                ) : (
                  <span className="text-xs text-slate-400">No post link</span>
                )}
              </div>
              {post.author_title ? (
                <p className="truncate text-xs text-slate-500" title={post.author_title}>
                  {post.author_title}
                </p>
              ) : null}
              <p
                className={`mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 ${
                  showPost ? '' : 'line-clamp-4'
                }`}
              >
                {postText || 'No text captured for this post.'}
              </p>
              {postText.length > 300 ? (
                <button type="button" className="btn-ghost mt-1 px-0" onClick={() => setShowPost((v) => !v)}>
                  {showPost ? 'Show less' : 'Show full post'}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* The comment */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`pill ${label.tone}`}>{label.text}</span>
            {post.comment_language && (status === 'drafted' || status === 'posted' || status === 'queued') ? (
              <span className="text-[11px] text-slate-500">{post.comment_language}</span>
            ) : null}
            {status === 'posted' && post.comment_posted_at ? (
              <span className="text-[11px] text-slate-500">{formatDateTime(post.comment_posted_at)}</span>
            ) : null}
          </div>

          {status === 'skipped' ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {post.comment_skip_reason || 'Not worth a comment.'}
            </p>
          ) : null}

          {(status === 'pending' || status === 'failed') && post.comment_error ? (
            <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              {post.comment_error}
            </p>
          ) : null}

          {whyNot ? (
            <p className="mb-2 text-xs font-medium text-amber-800">Can't be selected: {whyNot}</p>
          ) : null}

          {editable ? (
            <>
              <textarea
                className={`input min-h-[110px] leading-relaxed ${over ? 'border-red-400' : ''}`}
                value={text}
                onChange={(e) => onText(e.target.value)}
                onBlur={onBlurText}
                aria-label="Comment text"
              />
              <p className={`mt-1 text-right text-[11px] tabular-nums ${over ? 'font-medium text-red-700' : 'text-slate-400'}`}>
                {text.length.toLocaleString()} / {COMMENT_CHAR_LIMIT.toLocaleString()}
                {over ? ' — too long for LinkedIn' : ''}
              </p>
            </>
          ) : status === 'queued' || status === 'posting' || status === 'posted' ? (
            <p className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {post.ai_comment_draft}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status === 'pending' ? (
              <>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => onAction('generate')}>
                  Generate comment
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAction('dismiss')}>
                  Dismiss
                </button>
              </>
            ) : null}
            {status === 'drafted' ? (
              <>
                <button type="button" className="btn-primary" disabled={busy || !canPost} onClick={() => onAction('post')}
                  title={!link ? 'This post has no link, so the extension cannot open it' : undefined}>
                  Post
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => onAction('regenerate')}>
                  ↻ Regenerate
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAction('dismiss')}>
                  Dismiss
                </button>
              </>
            ) : null}
            {status === 'skipped' ? (
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => onAction('force')}>
                Generate anyway
              </button>
            ) : null}
            {status === 'queued' ? (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAction('cancel')}>
                Cancel
              </button>
            ) : null}
            {status === 'failed' ? (
              <>
                <button type="button" className="btn-primary" disabled={busy || !canPost} onClick={() => onAction('post')}>
                  Try again
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => onAction('regenerate')}>
                  ↻ Regenerate
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

type RowAction = 'generate' | 'regenerate' | 'force' | 'post' | 'cancel' | 'dismiss';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function CommentsPage() {
  const { user, clientId } = useAuth();
  const userId = user?.id ?? null;
  const extension = useExtensionTask();

  const [posts, setPosts] = useState<CommentPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [actionError, setActionError] = useState<FriendlyError | null>(null);
  const [tab, setTab] = useState<TabKey>('review');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [drafting, setDrafting] = useState<{ done: number; remaining: number } | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<number | null>(null);
  const inFlight = useRef(false);
  const draftingRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const res = await loadCommentPosts();
    if (res.error) setLoadError(res.error);
    else {
      setLoadError(null);
      setPosts(res.data);
    }
    setLoaded(true);
    inFlight.current = false;
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  // Keep calling the drafting workflow (8 posts per call) until nothing is waiting.
  const runDrafting = useCallback(async () => {
    if (!userId || draftingRef.current) return;
    draftingRef.current = true;
    let done = 0;
    setDrafting({ done: 0, remaining: 0 });
    for (let round = 0; round < 100; round++) {
      const res = await runDraftBatch(userId);
      if (res.error) {
        setActionError(res.error);
        break;
      }
      done += res.data.drafted + res.data.skipped + res.data.failed;
      setDrafting({ done, remaining: res.data.remaining });
      await load();
      if (res.data.remaining === 0) break;
      if (res.data.drafted + res.data.skipped + res.data.failed === 0) {
        await new Promise((r) => window.setTimeout(r, 3000)); // another run holds them; wait a moment
      }
    }
    setDrafting(null);
    draftingRef.current = false;
    await load();
  }, [userId, load]);

  // If drafts were left waiting (page closed mid-run), pick them up again.
  useEffect(() => {
    if (loaded && userId && posts.some((p) => p.comment_owner === userId && statusOf(p) === 'draft_requested')) {
      void runDrafting();
    }
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const counts = useMemo(() => {
    const c = {} as Record<TabKey, number>;
    for (const t of TABS) {
      c[t.key] = t.statuses ? posts.filter((p) => t.statuses!.includes(statusOf(p))).length : posts.length;
    }
    return c;
  }, [posts]);

  const pendingCount = useMemo(() => posts.filter((p) => statusOf(p) === 'pending').length, [posts]);

  // Posts saved before the link fix: the extension can never open them.
  const linkless = useMemo(
    () => posts.filter((p) => !hasPostLink(p) && ['pending', 'drafted', 'failed'].includes(statusOf(p))),
    [posts],
  );
  const [cleaning, setCleaning] = useState(false);
  const dismissLinkless = async () => {
    if (!linkless.length) return;
    if (!window.confirm(`Move ${linkless.length} posts without a link to Skipped? You can still see them there.`)) return;
    setCleaning(true);
    const ids = linkless.map((p) => p.id);
    await withBusy(ids, () => dismissPosts(ids));
    setCleaning(false);
  };

  const visible = useMemo(() => {
    const t = TABS.find((x) => x.key === tab)!;
    return t.statuses ? posts.filter((p) => t.statuses!.includes(statusOf(p))) : posts;
  }, [posts, tab]);

  const textFor = (p: CommentPost) => edits[p.id] ?? p.ai_comment_draft ?? '';

  const postable = useCallback(
    (p: CommentPost) => {
      const text = (edits[p.id] ?? p.ai_comment_draft ?? '').trim();
      return hasPostLink(p) && text.length > 0 && text.length <= COMMENT_CHAR_LIMIT;
    },
    [edits],
  );

  const selectableInView = visible.filter((p) => ['drafted', 'failed'].includes(statusOf(p)) && postable(p));
  const selectedInView = selectableInView.filter((p) => selected.has(p.id));

  const withBusy = async (ids: string[], fn: () => Promise<{ error: FriendlyError | null }>) => {
    setActionError(null);
    setBusyIds((prev) => new Set([...prev, ...ids]));
    const res = await fn();
    if (res.error) setActionError(res.error);
    setBusyIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    await load();
    return res;
  };

  const clearEdits = (ids: string[]) =>
    setEdits((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });

  const queue = async (items: CommentPost[]) => {
    if (!userId || items.length === 0) return;
    const payload = items.map((p) => ({ id: p.id, text: textFor(p).trim() }));
    const res = await withBusy(payload.map((p) => p.id), () => queueComments(payload, userId));
    if (!res.error) {
      clearEdits(payload.map((p) => p.id));
      setSelected(new Set());
      setQueuedNotice(payload.length);
      if (extension.status === 'connected') extension.chooseTask('comment_poster');
    }
  };

  const onAction = async (post: CommentPost, action: RowAction) => {
    if (!userId) return;
    const ids = [post.id];
    if (action === 'post') return queue([post]);
    if (action === 'cancel') return void withBusy(ids, () => cancelQueued(ids));
    if (action === 'dismiss') return void withBusy(ids, () => dismissPosts(ids));
    // generate / regenerate / force: ask the AI, then run the writer
    const force = action !== 'generate'; // the user has seen it and wants a comment
    const res = await withBusy(ids, () => requestDrafts(ids, userId, force));
    if (!res.error) {
      clearEdits(ids);
      void runDrafting();
    }
  };

  const generateAllNew = async () => {
    if (!userId) return;
    setActionError(null);
    const res = await requestDraftsForAllNew(userId);
    if (res.error) {
      setActionError(res.error);
      return;
    }
    await load();
    void runDrafting();
  };

  const onBlurText = async (post: CommentPost) => {
    const text = edits[post.id];
    if (text === undefined || text === (post.ai_comment_draft ?? '')) return;
    const res = await saveDraftText(post.id, text);
    if (res.error) setActionError(res.error);
  };

  if (!userId) {
    return (
      <>
        <PageHeader title="Comments" />
        <EmptyState title="Not signed in">Sign in again to write comments.</EmptyState>
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Comments" />
        <ErrorState error={loadError} onRetry={() => void load()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Comments"
        description="The AI writes a comment for each scraped post using your prompt. Review and edit them, then post the ones you like — the GAB extension posts them on LinkedIn, one at a time."
        actions={
          <button
            type="button"
            className="btn-primary"
            disabled={!loaded || pendingCount === 0 || drafting !== null}
            onClick={() => void generateAllNew()}
          >
            {drafting ? 'Writing…' : `Generate comments for all new posts${pendingCount ? ` (${pendingCount})` : ''}`}
          </button>
        }
      />

      <CommentPromptPanel userId={userId} clientId={clientId} />

      {drafting ? (
        <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
          The AI is writing comments… {drafting.done} done
          {drafting.remaining ? `, ${drafting.remaining} to go` : ''}. You can keep reviewing meanwhile.
        </p>
      ) : null}

      {linkless.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            {linkless.length} {linkless.length === 1 ? 'post has' : 'posts have'} no link, so the extension can't open{' '}
            {linkless.length === 1 ? 'it' : 'them'} to comment. Scraping the same search again adds the link if the post shows up;
            otherwise move them out of the way.
          </span>
          <button type="button" className="btn-secondary" disabled={cleaning} onClick={() => void dismissLinkless()}>
            {cleaning ? 'Moving…' : `Move ${linkless.length} to Skipped`}
          </button>
        </div>
      ) : null}

      {queuedNotice ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            {queuedNotice} {queuedNotice === 1 ? 'comment is' : 'comments are'} queued.{' '}
            {extension.status === 'connected'
              ? 'Your extension is now set to Comment Poster. Open LinkedIn and press Start in the Comment Poster panel.'
              : 'Open LinkedIn with the GAB extension and choose Comment Poster on the Dashboard.'}
          </span>
          <span className="flex items-center gap-2">
            <a href="https://www.linkedin.com/feed/" target="_blank" rel="noreferrer" className="btn-secondary">
              Open LinkedIn ↗
            </a>
            <button type="button" className="btn-ghost" onClick={() => setQueuedNotice(null)}>
              Close
            </button>
          </span>
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-4">
          <InlineError error={actionError} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-brand-600 text-brand-800'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs tabular-nums text-slate-400">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {(tab === 'review' || tab === 'failed') && selectableInView.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={selectedInView.length > 0 && selectedInView.length === selectableInView.length}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(selectableInView.map((p) => p.id)) : new Set())
              }
            />
            Select all ({selectableInView.length})
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={selectedInView.length === 0}
            onClick={() => void queue(selectedInView)}
          >
            Post selected ({selectedInView.length})
          </button>
        </div>
      ) : null}

      {!loaded ? (
        <SkeletonCards count={3} />
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet">
          Scrape some posts first (Dashboard → Post Scraper). They show up here, ready for comments.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing here">
          {tab === 'review'
            ? pendingCount
              ? `You have ${pendingCount} new posts without a comment. Press "Generate comments for all new posts".`
              : 'No comments are waiting for review.'
            : 'No posts in this list right now.'}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {visible.map((post) => (
            <CommentRow
              key={post.id}
              post={post}
              text={textFor(post)}
              selected={selected.has(post.id)}
              busy={busyIds.has(post.id) || ['draft_requested', 'drafting', 'posting'].includes(statusOf(post))}
              onText={(value) => setEdits((prev) => ({ ...prev, [post.id]: value }))}
              onBlurText={() => void onBlurText(post)}
              onToggle={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(post.id)) next.delete(post.id);
                  else next.add(post.id);
                  return next;
                })
              }
              onAction={(action) => void onAction(post, action)}
            />
          ))}
        </div>
      )}
    </>
  );
}
