import { POST_WRITER_WEBHOOK, PUBLISH_NOW_WEBHOOK } from './constants';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/** Batch E: posts on the member's own LinkedIn profile through LinkedIn's official API. */
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
export interface ScheduledPost {
  id: number;
  body: string;
  scheduled_at: string;
  tz: string | null;
  status: PostStatus;
  post_url: string | null;
  error: string | null;
  published_at: string | null;
  created_at: string;
}
export interface LinkedInConnection {
  name: string | null;
  email: string | null;
  picture: string | null;
  status: 'connected' | 'expired';
  expires_at: string;
  connected_at: string;
  last_error: string | null;
  can_post_pages: boolean;
}

export const MAX_POST = 3000;
/** LinkedIn shows about this much of a post before "…see more". */
export const PREVIEW_CHARS = 210;

type Result<T> = { data: T; error: null; missing?: false } | { data: null; error: FriendlyError | null; missing?: boolean };
const cfgErr = (): FriendlyError => ({ message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' });
const isMissing = (e: { code?: string; message?: string }) =>
  ['PGRST202', 'PGRST205', '42883', '42P01'].includes(e.code ?? '') || /could not find the (function|table)/i.test(e.message ?? '');
const plain = (e: { message: string; code?: string }): FriendlyError => ({ message: e.message, hint: null, code: e.code ?? null });

export async function loadPublishState(): Promise<Result<{ ready: boolean; connection: LinkedInConnection | null }>> {
  if (!supabase) return { data: null, error: cfgErr() };
  const [r, c] = await Promise.all([supabase.rpc('gab_linkedin_ready'), supabase.rpc('gab_my_linkedin')]);
  const e = r.error ?? c.error;
  if (e) return isMissing(e) ? { data: null, error: null, missing: true } : { data: null, error: toFriendlyError(e) };
  const row = Array.isArray(c.data) ? c.data[0] : c.data;
  return { data: { ready: r.data === true, connection: (row as LinkedInConnection) ?? null }, error: null };
}

/** Sends the member to LinkedIn's "Allow Impact Connect" page. */
export async function startLinkedInConnect(): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { data, error } = await supabase.rpc('gab_linkedin_start');
  if (error) return plain(error);
  const row = (Array.isArray(data) ? data[0] : data) as { state: string; client_id: string; redirect_uri: string; scope: string } | null;
  if (!row) return { message: 'Could not start the LinkedIn connection.', hint: null, code: null };
  const q = new URLSearchParams({ response_type: 'code', client_id: row.client_id, redirect_uri: row.redirect_uri, state: row.state, scope: row.scope });
  window.location.assign('https://www.linkedin.com/oauth/v2/authorization?' + q.toString());
  return null;
}

export async function disconnectLinkedIn(): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase.rpc('gab_linkedin_disconnect');
  return error ? toFriendlyError(error) : null;
}

export async function loadPosts(): Promise<Result<ScheduledPost[]>> {
  if (!supabase) return { data: null, error: cfgErr() };
  const { data, error } = await supabase
    .from('gab_scheduled_posts')
    .select('id, body, scheduled_at, tz, status, post_url, error, published_at, created_at')
    .order('scheduled_at', { ascending: false })
    .limit(300);
  if (error) return isMissing(error) ? { data: null, error: null, missing: true } : { data: null, error: toFriendlyError(error) };
  return { data: (data as ScheduledPost[]) ?? [], error: null };
}

export interface PostDraft {
  body: string;
  scheduled_at: string; // ISO (UTC)
  tz: string;
  status: 'draft' | 'scheduled';
}
export async function savePost(d: PostDraft, id?: number): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const row = { body: d.body.trim(), scheduled_at: d.scheduled_at, tz: d.tz, status: d.status };
  const { error } = id ? await supabase.from('gab_scheduled_posts').update(row).eq('id', id) : await supabase.from('gab_scheduled_posts').insert(row);
  return error ? toFriendlyError(error) : null;
}
export async function deletePost(id: number): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase.from('gab_scheduled_posts').delete().eq('id', id);
  return error ? toFriendlyError(error) : null;
}
export async function retryPost(id: number): Promise<FriendlyError | null> {
  if (!supabase) return cfgErr();
  const { error } = await supabase.from('gab_scheduled_posts').update({ status: 'scheduled', scheduled_at: new Date().toISOString() }).eq('id', id);
  return error ? toFriendlyError(error) : null;
}

/** Ask n8n to post whatever is due right away (otherwise it checks every 5 minutes). */
export async function publishNow(): Promise<void> {
  try {
    await fetch(PUBLISH_NOW_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } catch {
    /* the 5-minute run picks it up */
  }
}

export async function writePosts(
  userId: string,
  p: { topic: string; tone: string; length: string; draft?: string },
): Promise<{ posts: string[]; error: null } | { posts: null; error: FriendlyError }> {
  try {
    const res = await fetch(POST_WRITER_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, ...p }),
    });
    const r = (await res.json().catch(() => null)) as { ok?: boolean; posts?: string[]; reason?: string } | null;
    if (r && r.ok && r.posts?.length) return { posts: r.posts, error: null };
    const why: Record<string, string> = {
      no_topic: 'Write a topic or an idea first.',
      no_licence: 'Your licence is not active.',
      ai_failed: 'The AI did not answer. Try again in a minute.',
    };
    return { posts: null, error: { message: why[r?.reason ?? ''] ?? 'The post writer is not available.', hint: r ? null : 'Is the "ODA GAB - Post Writer" workflow active in n8n?', code: 'WRITER' } };
  } catch (cause) {
    return { posts: null, error: { message: 'The post writer could not be reached.', hint: cause instanceof Error ? cause.message : String(cause), code: 'WRITER' } };
  }
}

// ---------------------------------------------------------------------------
// Time zones: the member picks a wall-clock time in their own zone
// ---------------------------------------------------------------------------
function offsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - Math.floor(ts / 1000) * 1000;
}
/** "2026-10-24" + "09:00" in Asia/Karachi → the moment (UTC). */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let t = wall;
  for (let i = 0; i < 3; i++) {
    const next = wall - offsetMs(t, tz);
    if (next === t) break;
    t = next;
  }
  return new Date(t);
}
/** The moment → { date: "2026-10-24", time: "09:00" } in the zone. */
export function utcToZoned(iso: string | Date, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}` };
}
export function formatInZone(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
