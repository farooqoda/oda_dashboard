import type { User } from '@supabase/supabase-js';

/** A friendly first name for the signed-in person: their saved name, else the email's first part. */
export function firstNameOf(user: User | null): string {
  if (!user) return '';
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const full = [meta.full_name, meta.name, meta.first_name].find((v) => typeof v === 'string' && v.trim()) as
    | string
    | undefined;
  const raw = full ? full.trim().split(/\s+/)[0] : (user.email ?? '').split('@')[0].split(/[._-]/)[0];
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : '';
}

/** Two-letter initials for a name ("Priya Shah" → "PS", "farooq" → "FA"). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "Good morning" / "Good afternoon" / "Good evening" for the viewer's own clock. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
