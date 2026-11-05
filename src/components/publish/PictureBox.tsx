import { useState } from 'react';
import { pickImage, removeImage, requestImage, type PostImage } from '../../lib/contentPlan';
import type { ScheduledPost } from '../../lib/publish';
import type { FriendlyError } from '../../lib/supabase';
import { InlineError } from '../ui';

/**
 * The picture of one post: preview, "AI picture" / "Stock photo" (with the idea or keywords),
 * the other stock photos to pick from, and "No picture". n8n makes the picture; the page looks again
 * every few seconds while one is being made.
 */
export function PictureBox({
  post,
  images,
  dataUrl,
  stockReady,
  onChanged,
  compact = false,
}: {
  post: ScheduledPost;
  images: PostImage[];
  dataUrl: string | null;
  stockReady: boolean | null;
  onChanged: () => void;
  compact?: boolean;
}) {
  const status = post.image_status ?? 'none';
  const chosen = images.find((i) => i.id === post.image_id) ?? null;
  const [source, setSource] = useState<'ai' | 'stock'>(post.image_source ?? 'stock');
  const [idea, setIdea] = useState(post.image_prompt ?? '');
  const [open, setOpen] = useState(!compact || status === 'failed');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const others = images.filter((i) => i.source === 'stock' && i.id !== post.image_id && i.thumb_url);
  const locked = post.status === 'publishing' || post.status === 'published';

  const run = async (f: () => Promise<FriendlyError | null>) => {
    setBusy(true);
    setErr(null);
    const e = await f();
    setBusy(false);
    if (e) setErr(e);
    onChanged();
  };
  const preview = chosen ? (chosen.source === 'ai' ? dataUrl : chosen.thumb_url || chosen.url) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3" data-testid={`picture-${post.id}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-center text-[11px] text-slate-500">
          {status === 'pending' ? (
            <span className="px-2" role="status">
              ⏳ {post.image_source === 'ai' ? 'Making the AI picture…' : 'Finding stock photos…'}
            </span>
          ) : status === 'ready' && preview ? (
            <img src={preview} alt={post.image_alt ?? ''} className="h-full w-full object-cover" />
          ) : status === 'failed' ? (
            <span className="px-2 text-red-700">No picture yet</span>
          ) : (
            <span className="px-2">No picture</span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-xs text-slate-600">
          {status === 'ready' && chosen ? (
            <p>
              {chosen.source === 'ai' ? '🎨 AI picture' : '📷 Stock photo'}
              {chosen.credit ? (
                <>
                  {' · '}
                  {chosen.credit_url ? (
                    <a className="underline" href={chosen.credit_url} target="_blank" rel="noreferrer">
                      {chosen.credit}
                    </a>
                  ) : (
                    chosen.credit
                  )}
                </>
              ) : null}
            </p>
          ) : null}
          {status === 'failed' && post.image_error ? <p className="text-red-700">{post.image_error}</p> : null}
          {status === 'none' ? <p>The post goes out as text only.</p> : null}
          {!locked ? (
            <button type="button" className="mt-1 text-xs font-medium text-brand-700 underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? '▾ Hide picture options' : status === 'none' ? '▸ Add a picture' : '▸ Change the picture'}
            </button>
          ) : null}
        </div>
      </div>

      {open && !locked ? (
        <div className="mt-3 space-y-2">
          {others.length && status !== 'pending' ? (
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Other stock photos — click one to use it</p>
              <div className="flex flex-wrap gap-2">
                {others.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className="h-14 w-24 overflow-hidden rounded border border-slate-200 hover:ring-2 hover:ring-brand-400 disabled:opacity-50"
                    title={i.credit ?? ''}
                    aria-label={`Use stock photo ${i.credit ?? i.id}`}
                    disabled={busy}
                    onClick={() => void run(() => pickImage(post.id, i.id))}
                  >
                    <img src={i.thumb_url ?? ''} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div role="radiogroup" aria-label="Picture source" className="flex overflow-hidden rounded-md border border-slate-300">
              {(['ai', 'stock'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={source === s}
                  className={`px-2.5 py-1 ${source === s ? 'bg-ink text-white' : 'bg-white text-slate-700'}`}
                  onClick={() => setSource(s)}
                >
                  {s === 'ai' ? '🎨 AI picture' : '📷 Stock photo'}
                </button>
              ))}
            </div>
            <input
              className="input min-w-[12rem] flex-1 py-1 text-xs"
              aria-label={source === 'ai' ? 'Picture idea' : 'Stock photo keywords'}
              placeholder={source === 'ai' ? 'Picture idea, e.g. a small team planning around a laptop, warm light' : 'Keywords, e.g. community workshop'}
              value={idea}
              maxLength={source === 'ai' ? 1000 : 100}
              onChange={(e) => setIdea(e.target.value)}
            />
            <button type="button" className="btn-secondary py-1 text-xs" disabled={busy || status === 'pending' || (source === 'stock' && stockReady === false)} onClick={() => void run(() => requestImage(post.id, source, idea))}>
              {source === 'ai' ? (status === 'ready' && post.image_source === 'ai' ? 'Make another' : 'Make picture') : 'Find photos'}
            </button>
            {status !== 'none' ? (
              <button type="button" className="btn-secondary py-1 text-xs" disabled={busy} onClick={() => void run(() => removeImage(post.id))}>
                No picture
              </button>
            ) : null}
          </div>
          {source === 'stock' && stockReady === false ? (
            <p className="text-[11px] text-amber-800">Stock photos are not set up yet: your administrator needs to add the free Pexels key (see the setup notes).</p>
          ) : (
            <p className="text-[11px] text-slate-500">
              {source === 'ai'
                ? 'The AI draws a new picture for this post (no text, logos or real people). Leave the idea empty to let it read the post.'
                : 'Free photos from Pexels. Leave the words empty to search with the post’s own words.'}
            </p>
          )}
          {err ? <InlineError error={err} title="Picture" /> : null}
        </div>
      ) : null}
    </div>
  );
}
