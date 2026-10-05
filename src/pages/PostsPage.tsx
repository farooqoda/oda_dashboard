import { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyButton, EmptyState, ErrorState, PageHeader, SkeletonTable } from '../components/ui';
import { MAX_ROWS } from '../lib/constants';
import { formatDateTime } from '../lib/format';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from '../lib/supabase';
import type { Post } from '../lib/types';

const COLUMNS =
  'id, client_id, user_id, post_url, author_name, author_linkedin_url, author_title, post_text, post_posted_at, scraped_at, ai_comment_draft, comment_status, comment_posted_at';

export function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(
    supabaseConfigError ? { message: supabaseConfigError, hint: null, code: 'CONFIG' } : null,
  );
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setRefreshing(true);
    const { data, error: err } = await supabase
      .from('gab_posts')
      .select(COLUMNS)
      .order('scraped_at', { ascending: false })
      .limit(MAX_ROWS);
    if (err) {
      setError(toFriendlyError(err));
    } else {
      setError(null);
      setPosts((data ?? []) as Post[]);
    }
    setLoaded(true);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) =>
      [p.author_name, p.author_title, p.post_text].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [posts, query]);

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
        description="LinkedIn posts collected by the Post Scraper in the browser extension. Open a feed or search-results page in LinkedIn and use the Post Scraper panel to add more."
        actions={
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search author or text"
              className="w-56 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
            />
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
          Use the Post Scraper panel on a LinkedIn feed page. Scraped posts appear here.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No posts match your search">Try a different author name or keyword.</EmptyState>
      ) : (
        <div className={`space-y-3 ${refreshing ? 'is-refreshing' : ''}`}>
          <p className="text-xs text-slate-600">
            {filtered.length.toLocaleString()} {filtered.length === 1 ? 'post' : 'posts'}
          </p>
          {filtered.map((post) => {
            const text = post.post_text?.trim() ?? '';
            const open = openId === post.id;
            return (
              <article key={post.id} className="card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    {post.author_linkedin_url ? (
                      <a
                        href={post.author_linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                      >
                        {post.author_name || 'Unknown author'}
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-slate-900">
                        {post.author_name || 'Unknown author'}
                      </span>
                    )}
                    {post.author_title ? (
                      <p className="truncate text-xs text-slate-600">{post.author_title}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {post.post_posted_at ? `Posted ${post.post_posted_at} · ` : ''}
                      Scraped {formatDateTime(post.scraped_at) ?? 'recently'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a href={post.post_url} target="_blank" rel="noreferrer" className="btn-secondary">
                      Open post
                    </a>
                    {text ? <CopyButton text={text} label="Copy text" /> : null}
                  </div>
                </div>
                {text ? (
                  <>
                    <p
                      className={`mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700 ${
                        open ? '' : 'line-clamp-4'
                      }`}
                    >
                      {text}
                    </p>
                    {text.length > 280 ? (
                      <button
                        type="button"
                        className="btn-ghost mt-1"
                        onClick={() => setOpenId(open ? null : post.id)}
                      >
                        {open ? 'Show less' : 'Show more'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">No text captured for this post.</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
