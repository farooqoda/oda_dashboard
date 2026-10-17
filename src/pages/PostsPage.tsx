import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EngagersPanel, engagersStatusText } from '../components/EngagersPanel';
import { CopyButton, EmptyState, ErrorState, PageHeader, SkeletonTable } from '../components/ui';
import { MAX_ROWS } from '../lib/constants';
import { downloadCsv, postsToCsv } from '../lib/csv';
import { formatDateTime } from '../lib/format';
import { isMissingColumn, type EngagerKind } from '../lib/engagers';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from '../lib/supabase';
import type { Post } from '../lib/types';

const COLUMNS =
  'id, client_id, user_id, post_url, author_name, author_linkedin_url, author_title, post_text, post_posted_at, scraped_at, ai_comment_draft, comment_status, comment_posted_at';
// v4.22: engagement counts and "Collect engagers" (needs the engagers SQL; without it the page uses COLUMNS)
const ENGAGEMENT_COLUMNS =
  ', reactions_count, comments_count, reposts_count, counts_at, engagers_status, engagers_found, engagers_error, engagers_done_at';

type SortKey = 'newest' | 'reactions' | 'comments' | 'engagement';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'newest', label: 'Newest first' },
  { key: 'engagement', label: 'Most engagement' },
  { key: 'reactions', label: 'Most reactions' },
  { key: 'comments', label: 'Most comments' },
];
const total = (p: Post) => (p.reactions_count ?? 0) + (p.comments_count ?? 0) + (p.reposts_count ?? 0);

function CountChip({ icon, value, title, onClick }: { icon: string; value: number | null | undefined; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs tabular-nums text-slate-800 hover:border-slate-400"
    >
      <span aria-hidden="true">{icon}</span>
      {value === null || value === undefined ? '–' : value.toLocaleString()}
    </button>
  );
}

/** While this page is open, new posts from a running scrape show up on their own. */
const AUTO_REFRESH_MS = 10_000;

function ExternalLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-xs text-slate-400">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
      title={href}
    >
      {label} ↗
    </a>
  );
}

export function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(
    supabaseConfigError ? { message: supabaseConfigError, hint: null, code: 'CONFIG' } : null,
  );
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('newest');
  const [hasEngagement, setHasEngagement] = useState(true);
  const [panel, setPanel] = useState<{ id: string; tab: 'all' | EngagerKind } | null>(null);
  const inFlight = useRef(false);
  const withEngagement = useRef(true);

  const load = useCallback(async (silent = false) => {
    if (!supabase || inFlight.current) return;
    inFlight.current = true;
    if (!silent) setRefreshing(true);
    const fetchPosts = (cols: string) =>
      supabase!.from('gab_posts').select(cols).order('scraped_at', { ascending: false }).limit(MAX_ROWS);
    let { data, error: err } = await fetchPosts(COLUMNS + (withEngagement.current ? ENGAGEMENT_COLUMNS : ''));
    if (err && withEngagement.current && isMissingColumn(err)) {
      // the engagement SQL has not been run yet: keep the page working without it
      withEngagement.current = false;
      setHasEngagement(false);
      ({ data, error: err } = await fetchPosts(COLUMNS));
    }
    if (err) {
      if (!silent) setError(toFriendlyError(err));
    } else {
      setError(null);
      setPosts((data ?? []) as unknown as Post[]);
    }
    setLoaded(true);
    setRefreshing(false);
    inFlight.current = false;
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? posts
      : posts.filter((p) => [p.author_name, p.author_title, p.post_text].some((v) => v?.toLowerCase().includes(q)));
    if (sort === 'newest') return list;
    const key = (p: Post) =>
      sort === 'reactions' ? p.reactions_count ?? -1 : sort === 'comments' ? p.comments_count ?? -1 : total(p);
    return [...list].sort((a, b) => key(b) - key(a));
  }, [posts, query, sort]);
  const panelPost = panel ? posts.find((p) => p.id === panel.id) ?? null : null;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`linkedin-posts-${stamp}.csv`, postsToCsv(filtered));
  };

  if (error) {
    return (
      <>
        <PageHeader title="Discover Conversations" />
        <ErrorState error={error} onRetry={() => void load()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Discover Conversations"
        description="Find posts and discussions connected to your goals. Choose Discover Conversations on the Dashboard, then press Scrape Posts on LinkedIn. This page updates every few seconds while it is open."
        actions={
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, headline or text"
              className="input w-56"
            />
            {hasEngagement ? (
              <select className="input w-44" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort posts">
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="btn-secondary"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void load()}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        }
      />

      {!loaded ? (
        <SkeletonTable rows={6} />
      ) : posts.length === 0 ? (
        <EmptyState title="No posts scraped yet">
          Pick Discover Conversations on the Dashboard, open a LinkedIn search, load the posts you want and press
          Scrape Posts. They appear here as they are saved.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No posts match your search">Try a different name or keyword.</EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-600">
            {filtered.length.toLocaleString()} {filtered.length === 1 ? 'post' : 'posts'}
            {query.trim() ? ` matching “${query.trim()}”` : ''} · click a row to read the full text
            {hasEngagement ? ' · click 👍 💬 🔁 to see who engaged and collect them' : ''}
          </p>
          {!hasEngagement ? (
            <p className="mb-3 rounded-2xl bg-sun-50 px-4 py-2.5 text-xs text-ink">
              Reaction, comment and repost counts appear here once the latest database update is installed.
            </p>
          ) : null}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] table-fixed text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="w-44 px-3 py-2 font-medium">Name</th>
                    <th scope="col" className="w-20 px-3 py-2 font-medium">Profile</th>
                    <th scope="col" className="w-20 px-3 py-2 font-medium">Post</th>
                    <th scope="col" className="w-56 px-3 py-2 font-medium">Headline</th>
                    <th scope="col" className="px-3 py-2 font-medium">Post text</th>
                    {hasEngagement ? <th scope="col" className="w-48 px-3 py-2 font-medium">Engagement</th> : null}
                    <th scope="col" className="w-36 px-3 py-2 font-medium">Scraped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((post) => {
                    const open = expanded.has(post.id);
                    const text = post.post_text?.trim() ?? '';
                    return (
                      <tr
                        key={post.id}
                        onClick={() => toggle(post.id)}
                        className="cursor-pointer align-top transition-colors hover:bg-slate-50"
                      >
                        <td className="px-3 py-2.5">
                          <span className="block truncate font-medium text-slate-900" title={post.author_name ?? undefined}>
                            {post.author_name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <ExternalLink href={post.author_linkedin_url} label="Open" />
                        </td>
                        <td className="px-3 py-2.5">
                          {/* Without a captured link the scraper stores LinkedIn's id ("gab-key:…") instead. */}
                          <ExternalLink href={post.post_url.startsWith('http') ? post.post_url : null} label="Open" />
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          <span className={open ? 'block break-words' : 'line-clamp-2 break-words'} title={post.author_title ?? undefined}>
                            {post.author_title || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          {text ? (
                            <>
                              <p className={`whitespace-pre-wrap break-words ${open ? '' : 'line-clamp-2'}`}>{text}</p>
                              {open ? (
                                <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                                  <CopyButton text={text} label="Copy text" />
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">No text captured</span>
                          )}
                        </td>
                        {hasEngagement ? (
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1">
                              <CountChip icon="👍" value={post.reactions_count} title="Reactions — see who reacted" onClick={() => setPanel({ id: post.id, tab: 'reaction' })} />
                              <CountChip icon="💬" value={post.comments_count} title="Comments — see who commented" onClick={() => setPanel({ id: post.id, tab: 'comment' })} />
                              <CountChip icon="🔁" value={post.reposts_count} title="Reposts — see who reposted" onClick={() => setPanel({ id: post.id, tab: 'repost' })} />
                            </div>
                            {engagersStatusText(post) ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPanel({ id: post.id, tab: 'all' });
                                }}
                                className={`mt-1 block text-left text-[11px] underline-offset-2 hover:underline ${post.engagers_status === 'failed' ? 'text-critical' : 'text-slate-600'}`}
                              >
                                {post.engagers_status === 'done' ? '👥 ' : ''}
                                {engagersStatusText(post)}
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                        <td className="px-3 py-2.5 text-xs tabular-nums text-slate-500">
                          {formatDateTime(post.scraped_at) ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {panelPost ? (
        <EngagersPanel
          key={panelPost.id}
          post={panelPost}
          initialTab={panel!.tab}
          onClose={() => setPanel(null)}
          onChanged={() => void load(true)}
        />
      ) : null}
    </>
  );
}
