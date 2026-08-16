import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * Missing configuration is not an exception — it is a state the UI renders, so
 * the app boots and explains itself instead of showing a blank screen.
 */
export const supabaseConfigError: string | null =
  !url || !anonKey
    ? 'Supabase is not configured. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.'
    : null;

export const supabaseUrl = url ?? null;

export const supabase: SupabaseClient | null = supabaseConfigError
  ? null
  : createClient(url as string, anonKey as string, {
      auth: {
        // The session is the app's identity now: it must survive a reload, and
        // it must be refreshed in the background or long sessions 401 mid-use.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

/** Shape of the error surfaced to the UI: the real message, plus a hint. */
export interface FriendlyError {
  message: string;
  hint: string | null;
  code: string | null;
}

const PERMISSION_CODES = new Set(['42501', 'PGRST301', '401', '403']);

/**
 * Never swallow the Supabase message — a permissions failure that reads
 * "Something went wrong" costs an hour of guessing. The real message is shown
 * verbatim, and RLS gets an explicit callout because it is the usual cause.
 */
export function toFriendlyError(error: unknown): FriendlyError {
  if (!error) return { message: 'Unknown error', hint: null, code: null };

  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  const message = e.message ?? String(error);
  const code = e.code ?? null;

  const looksLikePermissions =
    (code !== null && PERMISSION_CODES.has(code)) ||
    /permission denied|not authorized|row-level security|RLS|JWT/i.test(message);

  let hint: string | null = e.hint ?? e.details ?? null;

  if (looksLikePermissions) {
    hint =
      'This looks like a permissions error. Check that Row Level Security on gab_leads and gab_activity grants the anon role SELECT (and UPDATE on gab_leads), and that VITE_SUPABASE_ANON_KEY belongs to this project.';
  } else if (/Failed to fetch|NetworkError|ERR_NAME_NOT_RESOLVED/i.test(message)) {
    hint =
      'The request never reached Supabase. Check VITE_SUPABASE_URL and your network connection.';
  }

  return { message, hint, code };
}
