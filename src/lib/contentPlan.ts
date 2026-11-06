import { CONTENT_PLAN_WEBHOOK, POST_IMAGES_WEBHOOK } from './constants';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/**
 * Batch O: content autopilot. The member's plan (topics, days, time, picture source); n8n writes the
 * week's posts into "To review" and makes their pictures. Nothing is posted until the member approves.
 */
export type ImageSource = 'ai' | 'stock' | 'none';
export interface ContentPlan {
  enabled: boolean;
  topics: string;
  audience: string;
  goal: string;
  tone: string;
  length: 'short' | 'medium' | 'long';
  language: string;
  posts_per_week: number;
  days: number[]; // ISO: 1 = Monday … 7 = Sunday
  post_time: string; // "09:00"
  tz: string;
  image_source: ImageSource;
  plan_requested_at?: string | null;
  last_planned_at?: string | null;
  last_result?: string | null;
}
export const DEFAULT_PLAN: ContentPlan = {
  enabled: false,
  topics: '',
  audience: '',
  goal: '',
  tone: 'friendly and professional',
  length: 'medium',
  language: 'English',
  posts_per_week: 3,
  days: [2, 4],
  post_time: '09:00',
  tz: 'UTC',
  image_source: 'stock',
};
export const WEEK_DAYS: Array<[number, string]> = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun'],
];

const cfgErr = (): FriendlyError => ({ message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' });
const PLAN_COLS = 'enabled, topics, audience, goal, tone, length, language, posts_per_week, days, post_time, tz, image_source, plan_requested_at, last_planned_at, last_result';

/** null data + missing = the Batch O database step has not been run. */
export async function loadPlan(userId: string): Promise<{ data: ContentPlan | null; exists: boolean; missing: boolean; error: FriendlyError | null }> {
  if (!supabase) return { data: null, exists: false, missing: false, error: cfgErr() };
  const { data, error } = await supabase.from('gab_content_plans').select(PLAN_COLS).eq('user_id', userId).maybeSingle();
  if (error) {
    const missing = ['PGRST205', '42P01'].includes(error.code ?? '') || /could not find the table/i.test(error.message ?? '');
    return { data: null, exists: false, missing, error: missing ? null : toFriendlyError(error) };
  }
  if (!data) return { data: null, exists: false, missing: false, error: null };
  const row = data as unknown as ContentPlan;
  return { data: { ...DEFAULT_PLAN, ...row, topics: row.topics ?? '', audience: row.audience ?? '', goal: row.goal ?? '' }, exists: true, missing: false, error: null };
}

function planFields(p: ContentPlan) {
  const days = Array.from(new Set(p.days)).filter((d) => d >= 1 && d <= 7).sort();
  return {
    enabled: p.enabled,
    topics: p.topics.trim() || null,
    audience: p.audience.trim() || null,
    goal: p.goal.trim() || null,
    tone: p.tone.trim().slice(0, 100) || 'friendly and professional',
    length: p.length,
    language: p.language,
    posts_per_week: Math.min(7, Math.max(1, Math.round(p.posts_per_week))),
    days,
    post_time: p.post_time,
    tz: p.tz,
    image_source: p.image_source,
  };
}

export async function savePlan(userId: string, p: ContentPlan, exists: boolean): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const f = planFields(p);
  const { error } = exists
    ? await supabase.from('gab_content_plans').update(f).eq('user_id', userId)
    : await supabase.from('gab_content_plans').insert({ user_id: userId, ...f });
  return error ? toFriendlyError(error) : null;
}

async function wake(url: string): Promise<void> {
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } catch {
    /* n8n looks again on its own schedule */
  }
}

/** "Plan my week now": n8n otherwise plans once a day. */
export async function requestPlanNow(userId: string): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase.from('gab_content_plans').update({ plan_requested_at: new Date().toISOString() }).eq('user_id', userId);
  if (error) return toFriendlyError(error);
  await wake(CONTENT_PLAN_WEBHOOK);
  return null;
}

export async function stockPhotosReady(): Promise<boolean | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('gab_stock_photos_ready');
  return error ? null : data === true;
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------
export interface PostImage {
  id: number;
  post_id: number;
  source: 'ai' | 'stock';
  thumb_url: string | null;
  url: string | null;
  credit: string | null;
  credit_url: string | null;
  mime: string | null;
}
/** All pictures of these posts (no bytes), plus the bytes of the AI pictures in use (for the preview). */
export async function loadImages(
  posts: Array<{ id: number; image_id?: number | null; image_source?: string | null }>,
  known: Record<number, string> = {},
): Promise<{
  byPost: Record<number, PostImage[]>;
  data: Record<number, string>;
}> {
  const empty = { byPost: {}, data: {} };
  if (!supabase || !posts.length) return empty;
  const ids = posts.map((p) => p.id);
  const { data, error } = await supabase
    .from('gab_post_images')
    .select('id, post_id, source, thumb_url, url, credit, credit_url, mime')
    .in('post_id', ids)
    .order('id', { ascending: true });
  if (error || !data) return empty;
  const byPost: Record<number, PostImage[]> = {};
  for (const r of data as unknown as PostImage[]) (byPost[r.post_id] ??= []).push(r);
  const aiInUse = posts.filter((p) => p.image_id && p.image_source === 'ai').map((p) => p.image_id as number);
  const bytes: Record<number, string> = {};
  for (const id of aiInUse) if (known[id]) bytes[id] = known[id]; // a picture never changes: keep what we have
  const todo = aiInUse.filter((id) => !bytes[id]);
  if (todo.length) {
    const d = await supabase.from('gab_post_images').select('id, mime, data_b64').in('id', todo);
    for (const r of (d.data ?? []) as Array<{ id: number; mime: string | null; data_b64: string | null }>) {
      if (r.data_b64) bytes[r.id] = `data:${r.mime || 'image/jpeg'};base64,${r.data_b64}`;
    }
  }
  return { byPost, data: bytes };
}

export async function requestImage(postId: number, source: 'ai' | 'stock', prompt: string): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase
    .from('gab_scheduled_posts')
    .update({ image_source: source, image_prompt: prompt.trim().slice(0, 1000) || null, image_status: 'pending' })
    .eq('id', postId);
  if (error) return toFriendlyError(error);
  await wake(POST_IMAGES_WEBHOOK);
  return null;
}
export async function removeImage(postId: number): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase.from('gab_scheduled_posts').update({ image_status: 'none' }).eq('id', postId);
  return error ? toFriendlyError(error) : null;
}
export async function pickImage(postId: number, imageId: number): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase.from('gab_scheduled_posts').update({ image_id: imageId }).eq('id', postId);
  if (error) return toFriendlyError(error);
  await wake(POST_IMAGES_WEBHOOK);
  return null;
}

/** Approve a reviewed post (with the text and time as they are now on screen). */
export async function approvePost(postId: number, body: string, scheduledAt: string, tz: string): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase
    .from('gab_scheduled_posts')
    .update({ body: body.trim(), scheduled_at: scheduledAt, tz, status: 'scheduled' })
    .eq('id', postId);
  return error ? toFriendlyError(error) : null;
}
export async function saveReview(postId: number, body: string, scheduledAt: string, tz: string): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase.from('gab_scheduled_posts').update({ body: body.trim(), scheduled_at: scheduledAt, tz }).eq('id', postId);
  return error ? toFriendlyError(error) : null;
}
export async function rejectPost(postId: number): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase.from('gab_scheduled_posts').update({ status: 'cancelled' }).eq('id', postId);
  return error ? toFriendlyError(error) : null;
}
