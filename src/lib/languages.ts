import { useEffect, useState } from 'react';
import { COMMENT_LANGUAGES } from './comments';
import { TRANSLATE_WEBHOOK } from './constants';
import { supabase, toFriendlyError, type FriendlyError } from './supabase';

/** Batch E2: the Message Studio language and "my language" (for translations), per member. */
export const ALL_LANGUAGES = COMMENT_LANGUAGES.filter((l) => l.value !== 'auto').flatMap((l) => (l.value === 'Urdu' ? ['Urdu', 'Roman Urdu'] : [l.value]));

export interface LanguageSettings {
  message_language: string; // '' = auto
  my_language: string; // '' = no translations
}
type Listener = (s: LanguageSettings | null) => void;
let current: LanguageSettings | null = null;
let loadedFor: string | null = null;
let missing = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((f) => f(current));

async function load(userId: string) {
  if (!supabase || loadedFor === userId) return;
  loadedFor = userId;
  const { data, error } = await supabase.from('gab_comment_settings').select('message_language, my_language').eq('user_id', userId).maybeSingle();
  if (error) {
    missing = true; // the Batch E2 database step has not been run: no pickers, no translations
    current = null;
  } else {
    const d = (data ?? {}) as { message_language?: string | null; my_language?: string | null };
    current = { message_language: d.message_language ?? '', my_language: d.my_language ?? '' };
  }
  emit();
}

/** Shared by every picker and translation on the page. null = loading or not available. */
export function useLanguageSettings(userId: string | undefined): { settings: LanguageSettings | null; missing: boolean } {
  const [s, setS] = useState<LanguageSettings | null>(current);
  useEffect(() => {
    listeners.add(setS);
    if (userId) void load(userId);
    return () => {
      listeners.delete(setS);
    };
  }, [userId]);
  return { settings: s, missing };
}

/** Insert-or-update by hand (members may not update user_id, so no upsert). */
export async function saveLanguageSetting(userId: string, clientId: string | null, patch: Partial<LanguageSettings>): Promise<FriendlyError | null> {
  if (!supabase) return { message: 'Not configured', hint: null, code: 'CONFIG' };
  const { data: existing, error: readError } = await supabase.from('gab_comment_settings').select('user_id').eq('user_id', userId).maybeSingle();
  if (readError) return toFriendlyError(readError);
  const fields: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(patch)) fields[k] = v ? v : null;
  const { error } = existing
    ? await supabase.from('gab_comment_settings').update(fields).eq('user_id', userId)
    : await supabase.from('gab_comment_settings').insert({ user_id: userId, client_id: clientId, ...fields });
  if (error) return toFriendlyError(error);
  current = { ...(current ?? { message_language: '', my_language: '' }), ...patch } as LanguageSettings;
  emit();
  return null;
}

// ---------------------------------------------------------------------------
// Translations: batched, cached in memory here and in the database by n8n
// ---------------------------------------------------------------------------
const memo = new Map<string, string>(); // target|text → translation ('' = already in that language)
type Wait = { text: string; resolve: (t: string | null) => void };
const queue = new Map<string, { userId: string; waits: Wait[] }>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  timer = null;
  const jobs = [...queue.entries()];
  queue.clear();
  for (const [target, job] of jobs) {
    const unique = [...new Set(job.waits.map((w) => w.text))];
    for (let i = 0; i < unique.length; i += 25) {
      const chunk = unique.slice(i, i + 25);
      let out: (string | null)[] = chunk.map(() => null);
      try {
        const res = await fetch(TRANSLATE_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: job.userId, target, texts: chunk }),
        });
        const r = (await res.json().catch(() => null)) as { ok?: boolean; translations?: (string | null)[] } | null;
        if (r && Array.isArray(r.translations)) out = chunk.map((_, k) => (typeof r.translations![k] === 'string' ? r.translations![k] : null));
      } catch {
        /* shown as "not available" */
      }
      chunk.forEach((t, k) => {
        if (out[k] !== null) memo.set(target + '|' + t, out[k] as string);
      });
      for (const w of job.waits) {
        const k = chunk.indexOf(w.text);
        if (k >= 0) w.resolve(out[k]);
      }
    }
  }
}

export function translate(userId: string, target: string, text: string): Promise<string | null> {
  const key = target + '|' + text;
  if (memo.has(key)) return Promise.resolve(memo.get(key)!);
  return new Promise((resolve) => {
    const job = queue.get(target) ?? { userId, waits: [] };
    job.waits.push({ text, resolve });
    queue.set(target, job);
    if (!timer) timer = setTimeout(() => void flush(), 120);
  });
}
export function cachedTranslation(target: string, text: string): string | undefined {
  return memo.get(target + '|' + text);
}
