import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  KIND_LABEL,
  REACTION_EMOJI,
  cancelEngagersRequest,
  deleteEngagers,
  loadEngagers,
  requestEngagers,
  sendToPeopleSearch,
  type Engager,
  type EngagerKind,
} from '../lib/engagers';
import { formatDateTime } from '../lib/format';
import type { FriendlyError } from '../lib/supabase';
import type { Post } from '../lib/types';
import { FormError } from './AuthLayout';

type Tab = 'all' | EngagerKind;

/** Where a post is in "Collect engagers", in words. */
export function engagersStatusText(post: Post): string | null {
  switch (post.engagers_status) {
    case 'requested':
      return 'Waiting for the extension on LinkedIn';
    case 'collecting':
      return 'Collecting on LinkedIn now…';
    case 'done':
      return `${(post.engagers_found ?? 0).toLocaleString()} people collected${post.engagers_done_at ? ' · ' + (formatDateTime(post.engagers_done_at) ?? '') : ''}`;
    case 'failed':
      return post.engagers_error || 'Collection failed';
    default:
      return null;
  }
}

export function EngagersPanel({
  post,
  initialTab,
  onClose,
  onChanged,
}: {
  post: Post;
  initialTab: Tab;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Engager[] | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const reload = useCallback(async () => {
    const r = await loadEngagers(post.id);
    if (r.error) setError(r.error);
    else {
      setError(null);
      setRows(r.data);
    }
  }, [post.id]);

  useEffect(() => {
    void reload();
  }, [reload, post.engagers_status, post.engagers_found]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const counts = useMemo(() => {
    const c = { all: 0, comment: 0, reaction: 0, repost: 0 } as Record<Tab, number>;
    for (const r of rows ?? []) {
      c.all += 1;
      c[r.kind] += 1;
    }
    return c;
  }, [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => tab === 'all' || r.kind === tab), [rows, tab]);
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));

  const togglePick = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pickAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allPicked) shown.forEach((r) => next.delete(r.id));
      else shown.forEach((r) => next.add(r.id));
      return next;
    });

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setNotice(null);
    setError(null);
    await fn();
    setBusy(null);
  };

  const ask = () =>
    run('ask', async () => {
      const err = await requestEngagers(post.id);
      if (err) setError(err);
      else {
        setNotice('Asked. Open LinkedIn with the Discover Conversations task and press “▶️ Collect engagers” in the extension panel.');
        onChanged();
      }
    });
  const cancel = () =>
    run('cancel', async () => {
      const err = await cancelEngagersRequest(post.id);
      if (err) setError(err);
      else onChanged();
    });
  const send = (queue: boolean) =>
    run(queue ? 'queue' : 'send', async () => {
      const ids = Array.from(picked);
      const r = await sendToPeopleSearch(ids, queue);
      if (r.error) {
        setError(r.error);
        return;
      }
      const people = new Set((rows ?? []).filter((x) => picked.has(x.id)).map((x) => x.linkedin_url)).size;
      const already = people - r.data;
      setNotice(
        `${r.data} added to People Search${already > 0 ? ` (${already} already there)` : ''}${
          queue ? ' and picked for syncing.' : '.'
        }`,
      );
      setPicked(new Set());
      await reload();
    });
  const remove = () =>
    run('delete', async () => {
      if (!window.confirm(`Remove ${picked.size} ${picked.size === 1 ? 'person' : 'people'} from this list?`)) return;
      const r = await deleteEngagers(Array.from(picked));
      if (r.error) setError(r.error);
      else {
        setPicked(new Set());
        await reload();
        onChanged();
      }
    });

  const status = post.engagers_status ?? 'none';
  const canAsk = status === 'none' || status === 'done' || status === 'failed';
  const statusText = engagersStatusText(post);
  const tabs: Array<{ key: Tab; label: string; known: number | null }> = [
    { key: 'all', label: 'All', known: null },
    { key: 'comment', label: '💬 Commented', known: post.comments_count ?? null },
    { key: 'reaction', label: '👍 Reacted', known: post.reactions_count ?? null },
    { key: 'repost', label: '🔁 Reposted', known: post.reposts_count ?? null },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-0 sm:p-6">
      <div aria-hidden="true" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="eg-title"
        className="relative flex max-h-full w-full flex-col overflow-hidden rounded-none bg-white sm:max-h-[calc(100vh-3rem)] sm:max-w-3xl sm:rounded-card"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">People who engaged with the post by</p>
            <h2 id="eg-title" className="truncate text-xl font-normal tracking-tight text-ink">
              {post.author_name || 'Unknown'}
            </h2>
            {post.post_text ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{post.post_text}</p> : null}
            {post.post_url.startsWith('http') ? (
              <a href={post.post_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-slate-700 underline underline-offset-2">
                Open the post ↗
              </a>
            ) : null}
          </div>
          <button ref={closeRef} type="button" className="btn-ghost shrink-0" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-6 py-3">
          <span className="text-sm text-slate-700">{statusText ?? 'Not collected yet.'}</span>
          <span className="ml-auto flex gap-2">
            {canAsk ? (
              <button type="button" className="btn-primary" disabled={busy !== null || !post.post_url.startsWith('http')} onClick={() => void ask()}
                title={post.post_url.startsWith('http') ? undefined : 'This post was saved without its link. Scrape it again first.'}>
                {busy === 'ask' ? 'Asking…' : status === 'none' ? 'Collect engagers' : 'Collect again'}
              </button>
            ) : null}
            {status === 'requested' ? (
              <button type="button" className="btn-secondary" disabled={busy !== null} onClick={() => void cancel()}>
                Cancel request
              </button>
            ) : null}
          </span>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-slate-200 px-6 pt-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-t-xl px-3 py-2 text-sm ${tab === t.key ? 'bg-ink text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {t.label} <span className="tabular-nums opacity-70">{counts[t.key]}{t.known !== null && t.known !== counts[t.key] ? ` of ${t.known}` : ''}</span>
            </button>
          ))}
        </div>

        <div className="min-h-[240px] flex-1 overflow-y-auto px-6 py-3">
          {error ? <FormError error={error} /> : null}
          {notice ? (
            <p role="status" className="mb-3 rounded-2xl bg-sun-50 px-4 py-2.5 text-sm text-ink">
              {notice}{' '}
              {/People Search/.test(notice) ? (
                <Link to="/bulk-leads" className="font-medium underline underline-offset-2">
                  Open People Search →
                </Link>
              ) : null}
            </p>
          ) : null}
          {rows === null ? (
            <div className="space-y-2 py-2">
              <div className="skeleton h-10 w-full" />
              <div className="skeleton h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">
              {status === 'requested' || status === 'collecting'
                ? 'The people appear here once the extension has collected them.'
                : 'Nobody collected yet. Press “Collect engagers”, then start the collection from the extension panel on LinkedIn.'}
            </p>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">Nobody in this group.</p>
          ) : (
            <>
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={allPicked} onChange={pickAll} />
                Select all ({shown.length})
              </label>
              <ul className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 py-2.5">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={picked.has(r.id)} onChange={() => togglePick(r.id)}
                      aria-label={`Select ${r.full_name ?? 'person'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm">
                        <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:underline">
                          {r.full_name || 'LinkedIn member'}
                        </a>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">
                          {r.kind === 'reaction' && r.reaction_type ? `${REACTION_EMOJI[r.reaction_type] ?? ''} ${r.reaction_type}` : KIND_LABEL[r.kind]}
                        </span>
                        {r.sent_at ? <span className="rounded-full bg-sun-100 px-2 py-0.5 text-[11px] text-ink">In People Search</span> : null}
                      </p>
                      {r.headline ? <p className="line-clamp-1 text-xs text-slate-600">{r.headline}</p> : null}
                      {r.comment_text ? (
                        <p className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">“{r.comment_text}”</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-6 py-3">
          <span className="text-sm text-slate-600">{picked.size} selected</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" disabled={!picked.size || busy !== null} onClick={() => void remove()}>
              Remove
            </button>
            <button type="button" className="btn-secondary" disabled={!picked.size || busy !== null} onClick={() => void send(false)}>
              {busy === 'send' ? 'Sending…' : 'Send to People Search'}
            </button>
            <button type="button" className="btn-primary" disabled={!picked.size || busy !== null} onClick={() => void send(true)}
              title="Adds them to People Search and picks them for syncing right away">
              {busy === 'queue' ? 'Sending…' : 'Send & pick for syncing'}
            </button>
          </span>
        </footer>
      </div>
    </div>
  );
}
