import { useEffect, useState } from 'react';
import { useAuth } from '../data/AuthProvider';
import { ALL_LANGUAGES, cachedTranslation, saveLanguageSetting, translate, useLanguageSettings } from '../lib/languages';
import type { FriendlyError } from '../lib/supabase';
import { InlineError } from './ui';

/**
 * Pickers for the Message Studio language and "Translate for me into".
 * `show`: 'messages' (both) or 'translate' (only the translation language).
 */
export function LanguagePickers({ show = 'translate', className = '' }: { show?: 'messages' | 'translate'; className?: string }) {
  const { user, clientId } = useAuth();
  const { settings, missing } = useLanguageSettings(user?.id);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState('');
  if (missing || !settings || !user) return null;
  const set = async (patch: { message_language?: string; my_language?: string }, what: string) => {
    setErr(null);
    setSaved('');
    const e = await saveLanguageSetting(user.id, clientId, patch);
    if (e) setErr(e);
    else setSaved(what);
  };
  return (
    <div className={`flex flex-wrap items-end gap-x-5 gap-y-2 text-sm ${className}`}>
      {show === 'messages' ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Message language (notes, messages, follow-ups, replies)</span>
          <select
            className="input w-auto py-1.5"
            aria-label="Message language"
            value={settings.message_language}
            onChange={(e) => void set({ message_language: e.target.value }, 'Message language saved. New drafts use it.')}
          >
            <option value="">The person's language (English if unclear)</option>
            {ALL_LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-slate-500">Show me a translation in</span>
        <select
          className="input w-auto py-1.5"
          aria-label="Translate for me into"
          value={settings.my_language}
          onChange={(e) => void set({ my_language: e.target.value }, e.target.value ? `Drafts in other languages now show a translation in ${e.target.value}.` : 'Translations off.')}
        >
          <option value="">Don't translate</option>
          {ALL_LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      {saved ? <span className="pb-2 text-xs text-emerald-700">{saved}</span> : null}
      {err ? <InlineError error={err} title="Not saved" /> : null}
    </div>
  );
}

/**
 * The text in "my language", under a draft. Nothing when translations are off, the text is empty,
 * or it is already in my language. `lang`: the language the text was written in, if known.
 */
export function Translation({ text, lang }: { text: string | null | undefined; lang?: string | null }) {
  const { user } = useAuth();
  const { settings } = useLanguageSettings(user?.id);
  const target = settings?.my_language ?? '';
  const src = (text ?? '').trim();
  const same = !!lang && !!target && lang.trim().toLowerCase() === target.toLowerCase();
  const skip = !user || !target || !src || same;
  const [out, setOut] = useState<string | null | undefined>(() => (skip ? undefined : cachedTranslation(target, src)));
  const [waiting, setWaiting] = useState(() => !skip && cachedTranslation(target, src) === undefined);
  useEffect(() => {
    if (skip || !user) {
      setOut(undefined);
      return;
    }
    const hit = cachedTranslation(target, src);
    if (hit !== undefined) {
      setOut(hit);
      return;
    }
    let live = true;
    setWaiting(true);
    // wait until typing stops before translating an edited text
    const t = setTimeout(() => {
      void translate(user.id, target, src).then((r) => {
        if (!live) return;
        setOut(r);
        setWaiting(false);
      });
    }, 900);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [skip, user, target, src]);
  if (skip) return null;
  if (out === '') return null; // already in my language
  return (
    <div className="mt-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-xs text-slate-600" aria-label={`Translation in ${target}`}>
      <span className="font-medium text-slate-500">🔁 {target}: </span>
      {out ? <span className="whitespace-pre-wrap">{out}</span> : waiting ? <span className="italic text-slate-400">translating…</span> : <span className="italic text-slate-400">translation not available right now</span>}
    </div>
  );
}
