import { DIGEST_WEBHOOK } from './constants';
import { isFollowupItem, isReplyItem } from './followups';
import type { AutomationSettings } from './automation';
import type { FriendlyError } from './supabase';
import type { Lead } from './types';

/**
 * Batch C: "Today" — what needs the member now. Shown on the Dashboard, behind the 🔔 in the top bar,
 * and (built the same way by n8n) in the morning email.
 */
export interface TodayItem {
  key: 'paused' | 'replies' | 'followups' | 'failed' | 'auto_off' | 'ext_missing' | 'accepted';
  icon: string;
  text: string;
  to: string; // a dashboard path, or an https:// link
  tone: 'red' | 'amber' | 'green' | 'slate';
  count: number;
}

const DAY = 86400000;

/** The member's own leads: sent by them, or saved by them and not sent by someone else. */
export function isMine(l: Lead, userId: string): boolean {
  return (l.send_owner ?? l.user_id) === userId;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function todayItems(leads: Lead[], userId: string | null, s: AutomationSettings | null, now = Date.now()): TodayItem[] {
  if (!userId) return [];
  const mine = leads.filter((l) => isMine(l, userId));
  const items: TodayItem[] = [];
  if (s?.safety_paused_until && new Date(s.safety_paused_until).getTime() > now) {
    items.push({ key: 'paused', icon: '🛑', tone: 'red', count: 1, to: '/settings', text: 'Automatic runs are paused after a LinkedIn warning' });
  }
  const replies = mine.filter((l) => isReplyItem(l) && l.send_kind !== 'reply').length;
  if (replies) items.push({ key: 'replies', icon: '💬', tone: 'green', count: replies, to: '/outreach?tab=replies', text: `${replies} ${plural(replies, 'person wrote', 'people wrote')} back — answer them` });
  const fus = mine.filter((l) => isFollowupItem(l) && ['drafted', 'failed'].includes(l.followup_status ?? '') && l.send_kind !== 'followup').length;
  if (fus) items.push({ key: 'followups', icon: '↩️', tone: 'amber', count: fus, to: '/outreach?tab=followups', text: `${fus} follow-up${fus === 1 ? '' : 's'} waiting for your approval` });
  const failed = mine.filter((l) => l.send_status === 'failed').length;
  if (failed) items.push({ key: 'failed', icon: '⚠️', tone: 'red', count: failed, to: '/outreach?tab=failed', text: `${failed} message${failed === 1 ? '' : 's'} failed to send` });
  const queued = mine.filter((l) => l.send_status === 'queued').length;
  const seen = s?.ext_seen_at ? new Date(s.ext_seen_at).getTime() : 0;
  if (s?.batch_c) {
    if (queued && seen && s.ext_auto?.ms !== true) {
      items.push({
        key: 'auto_off', icon: '⏳', tone: 'amber', count: queued, to: 'https://www.linkedin.com/feed/',
        text: `${queued} queued, but Message Studio does not start by itself — press Start on LinkedIn, or tick ⚡ there`,
      });
    }
    if (queued && (!seen || now - seen > 2 * DAY)) {
      items.push({
        key: 'ext_missing', icon: '🔌', tone: 'amber', count: 1, to: 'https://www.linkedin.com/feed/',
        text: seen ? `The extension has not been seen for ${Math.floor((now - seen) / DAY)} days — open LinkedIn in Chrome` : 'The extension has not checked in yet — open LinkedIn in Chrome with it installed',
      });
    }
  }
  const accepted = mine.filter((l) => l.connected_detected_at && now - new Date(l.connected_detected_at).getTime() < DAY).length;
  if (accepted) items.push({ key: 'accepted', icon: '🤝', tone: 'slate', count: accepted, to: '/outreach?tab=sent', text: `${accepted} invite${accepted === 1 ? ' was' : 's were'} accepted in the last day` });
  return items;
}

/** The number on the bell: things that need the member to act. */
export function bellCount(items: TodayItem[]): number {
  return items.filter((i) => i.key !== 'accepted').reduce((n, i) => n + (i.key === 'paused' || i.key === 'ext_missing' || i.key === 'auto_off' ? 1 : i.count), 0);
}

/** "Send me a test email" in Settings. */
export async function sendTestDigest(userId: string): Promise<FriendlyError | null> {
  try {
    const res = await fetch(DIGEST_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const raw = await res.text().catch(() => '');
    let r: Record<string, unknown> | null = null;
    try {
      r = JSON.parse(raw);
    } catch {
      r = null;
    }
    if (res.ok && r && r.ok === true && Number(r.sent) > 0) return null;
    if (r && r.reason === 'email_failed') {
      return { message: 'The email could not be sent.', hint: `Check the SMTP account in n8n. Details: ${String(r.detail ?? '').slice(0, 200)}`, code: 'DIGEST' };
    }
    if (r && r.reason === 'no_email') {
      return { message: 'No email was sent.', hint: 'Your licence is not active, or your account has no email address.', code: 'DIGEST' };
    }
    return { message: `The morning email service returned an error${res.ok ? '' : ` (${res.status})`}.`, hint: raw ? raw.slice(0, 200) : 'Is the "ODA GAB - Morning Digest" workflow active in n8n?', code: 'DIGEST' };
  } catch (cause) {
    return { message: 'The morning email service could not be reached.', hint: cause instanceof Error ? cause.message : String(cause), code: 'DIGEST' };
  }
}
