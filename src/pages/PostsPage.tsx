import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton, EmptyState, ErrorState, PageHeader, SkeletonTable } from '../components/ui';
import { MAX_ROWS } from '../lib/constants';
import { downloadCsv, postsToCsv } from '../lib/csv';
import { formatDateTime } from '../lib/format';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from '../lib/supabase';
import type { Post } from '../lib/types';

const COLUMNS =
  'id, client_id, user_id, post_url, author_name, author_linkedin_url, author_title, post_text, post_posted_at, scraped_at, ai_comment_draft, comment_status, comment_posted_at';

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
  const inFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!supabase || inFlight.current) return;
    inFlight.current = true;
    if (!silent) setRefreshing(true);
    const { data, error: err } = await supabase
      .from('gab_posts')
      .select(COLUMNS)
      .order('scraped_at', { ascending: false })
      .limit(MAX_ROWS);
    if (err) {
      if (!silent) setError(toFriendlyError(err));
    } else {
      setError(null);
      setPosts((data ?? []) as Post[]);
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
    if (!q) return posts;
    return posts.filter((p) =>
      [p.author_name, p.author_title, p.post_text].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [posts, query]);

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
        <PageHeader title="Posts" />
        <ErrorState error={error} onRetry={() => void load()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Posts"
        description="Posts collected by the Post Scraper. Choose Post Scraper on the Dashboard, then press Scrape Posts on LinkedIn. This page updates every few seconds while it is open."
        actions={
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, headline or text"
              className="input w-56"
            />
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
          Pick Post Scraper on the Dashboard, open a LinkedIn search, load the posts you want and press
          Scrape Posts. They appear here as they are saved.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No posts match your search">Try a different name or keyword.</EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-600">
            {filtered.length.toLocaleString()} {filtered.length === 1 ? 'post' : 'posts'}
            {query.trim() ? ` matching “${query.trim()}”` : ''} · click a row to read the full text
          </p>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] table-fixed text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="w-44 px-3 py-2 font-medium">Name</th>
                    <th scope="col" className="w-20 px-3 py-2 font-medium">Profile</th>
                    <th scope="col" className="w-20 px-3 py-2 font-medium">Post</th>
                    <th scope="col" className="w-56 px-3 py-2 font-medium">Headline</th>
                    <th scope="col" className="px-3 py-2 font-medium">Post text</th>
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
                          <ExternalLink href={post.post_url} label="Open" />
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
    </>
  );
}
