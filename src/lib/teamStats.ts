import type { ActivityRow, DailyRow } from './team';

/** Shared by the Team page and the client report. */
export const DAY = 86400000;

// ---------------------------------------------------------------------------
// Dates (local calendar days, as YYYY-MM-DD)
// ---------------------------------------------------------------------------
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function preset(key: string): [string, string] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = (n: number) => new Date(today.getTime() - n * DAY);
  switch (key) {
    case 'today':
      return [iso(today), iso(today)];
    case '30':
      return [iso(back(29)), iso(today)];
    case 'month':
      return [iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(today)];
    case 'last_month':
      return [iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)), iso(new Date(today.getFullYear(), today.getMonth(), 0))];
    case '90':
      return [iso(back(89)), iso(today)];
    default:
      return [iso(back(6)), iso(today)];
  }
}
export const PRESETS: Array<[string, string]> = [
  ['today', 'Today'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['month', 'This month'],
  ['last_month', 'Last month'],
  ['90', 'Last 90 days'],
];

// ---------------------------------------------------------------------------
// What the app did (numbers shown everywhere on the page)
// ---------------------------------------------------------------------------
export type NumKey = 'profiles' | 'searched' | 'posts' | 'engagers' | 'comments' | 'invites' | 'messages' | 'followups' | 'accepted' | 'replies' | 'replies_sent';
export const NUM: Array<{ key: NumKey; label: string; title: string }> = [
  { key: 'profiles', label: 'Profiles saved', title: 'Leads saved with Find People / Sync' },
  { key: 'searched', label: 'Searched', title: 'People Search results synced' },
  { key: 'posts', label: 'Posts', title: 'Posts saved by the Post Scraper' },
  { key: 'engagers', label: 'Engagers', title: 'People collected from likes and comments' },
  { key: 'comments', label: 'Comments', title: 'Comments posted' },
  { key: 'invites', label: 'Invites', title: 'Connection requests sent' },
  { key: 'messages', label: 'Messages', title: 'First messages sent' },
  { key: 'followups', label: 'Follow-ups', title: 'People who got a follow-up' },
  { key: 'accepted', label: 'Accepted', title: 'Invites accepted' },
  { key: 'replies', label: 'Replies', title: 'People who wrote back' },
  { key: 'replies_sent', label: 'Answered', title: 'Replies sent through Message Studio' },
];

/** Up to 14 days: one bar a day; up to ~3 months: one a week; longer: one a month. */
export function bucket(daily: DailyRow[]): { label: string; value: number }[] {
  const val = (d: DailyRow) => d.invites + d.messages + d.followups + d.comments + d.profiles;
  const at = (d: DailyRow) => new Date(d.day + 'T00:00:00');
  if (daily.length <= 14) return daily.map((d) => ({ label: at(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: val(d) }));
  const out = new Map<string, number>();
  for (const d of daily) {
    const t = at(d);
    let key: string;
    if (daily.length <= 100) {
      const monday = new Date(t.getTime() - ((t.getDay() + 6) % 7) * DAY);
      key = 'Wk ' + monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else key = t.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    out.set(key, (out.get(key) ?? 0) + val(d));
  }
  return [...out.entries()].map(([label, value]) => ({ label, value }));
}

export function sum(rows: ActivityRow[]) {
  const t = {} as Record<NumKey | 'queued' | 'failed' | 'to_approve', number>;
  for (const r of rows) for (const k of [...NUM.map((n) => n.key), 'queued', 'failed', 'to_approve'] as const) t[k] = (t[k] ?? 0) + (Number(r[k]) || 0);
  return t;
}
export const hours = (min: number) => (min >= 60 ? `${(min / 60).toFixed(min >= 600 ? 0 : 1)} h` : `${Math.round(min)} min`);
export const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
