/**
 * Numbers for the Impact Connect home page, computed only from rows the
 * dashboard already loads (gab_leads, gab_posts). Nothing here is invented:
 * where the data cannot answer a question exactly, the label says so.
 */
import { displayName, stageOf } from './format';
import { fitScore } from './traitsRegistry';
import type { CommentPost, Lead } from './types';

const DAY = 24 * 60 * 60 * 1000;
const REPLIED = new Set(['Replied', 'Interested', 'Meeting Scheduled', 'Won']);

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Sunday-start week, as in the design's S M T W T F S chart. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function isConnected(lead: Lead): boolean {
  const s = lead.connection_status?.trim().toLowerCase() ?? '';
  return s === 'connected' || s === '1st' || s.startsWith('connected');
}

export function hasReplied(lead: Lead): boolean {
  return REPLIED.has(stageOf(lead));
}

/** Reached out to: moved past New Lead, or the extension sent something. */
export function wasContacted(lead: Lead): boolean {
  return stageOf(lead) !== 'New Lead' || lead.send_status === 'sent';
}

// ---------------------------------------------------------------------------
// Suggested connection: the best-fit person nobody has reached out to yet.
// ---------------------------------------------------------------------------
export function suggestedConnection(leads: Lead[]): Lead | null {
  let best: Lead | null = null;
  let bestScore = -1;
  for (const lead of leads) {
    if (wasContacted(lead) || lead.send_status === 'queued' || lead.send_status === 'sending') continue;
    if (stageOf(lead) === 'Lost') continue;
    const score = fitScore(lead.traits) ?? -1;
    if (score > bestScore) {
      best = lead;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Your network: the people most recently connected with or replying.
// ---------------------------------------------------------------------------
export interface NetworkNode {
  lead: Lead;
  name: string;
  replied: boolean;
  recent: boolean;
}

export function networkNodes(leads: Lead[], max = 6, now = Date.now()): { nodes: NetworkNode[]; activeThisWeek: number } {
  const engaged = leads.filter((l) => isConnected(l) || hasReplied(l));
  const ts = (l: Lead) => time(l.updated_at) ?? time(l.created_at) ?? 0;
  engaged.sort((a, b) => ts(b) - ts(a));
  const activeThisWeek = engaged.filter((l) => now - ts(l) < 7 * DAY).length;
  return {
    activeThisWeek,
    nodes: engaged.slice(0, max).map((lead) => ({
      lead,
      name: displayName(lead),
      replied: hasReplied(lead),
      recent: now - ts(lead) < 7 * DAY,
    })),
  };
}

// ---------------------------------------------------------------------------
// Outreach: messages the extension sent, per day of the current week.
// ---------------------------------------------------------------------------
export interface DayBar {
  label: string;
  count: number;
  future: boolean;
}

/** Messages sent per day over the last 7 days, ending today. */
export function sentThisWeek(leads: Lead[], now = new Date()): { days: DayBar[]; total: number } {
  const today = startOfDay(now).getTime();
  const start = today - 6 * DAY;
  const counts = new Array(7).fill(0) as number[];
  const add = (t: number | null) => {
    if (t === null || t < start || t >= start + 7 * DAY) return;
    counts[Math.floor((t - start) / DAY)] += 1;
  };
  for (const lead of leads) {
    // first messages, plus (v4.36.5) follow-ups and replies sent through Impact Connect
    if (lead.send_status === 'sent' || lead.send_kind) add(time(lead.send_sent_at));
    add(time(lead.followup_last_sent_at));
    if (lead.reply_draft_status === 'sent') add(time(lead.reply_sent_at));
  }
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return {
    total: counts.reduce((a, b) => a + b, 0),
    days: counts.map((count, i) => ({ label: letters[new Date(start + i * DAY).getDay()], count, future: false })),
  };
}

// ---------------------------------------------------------------------------
// Reply rate: contacted → accepted → replied.
// ---------------------------------------------------------------------------
export type FunnelPeriod = 7 | 30 | 90 | 'all';

/** When we first reached out (the first message / invite), for the reply-rate period. */
function contactedAt(lead: Lead): number | null {
  return time(lead.send_sent_at) ?? time(lead.created_at);
}

export function replyFunnel(leads: Lead[], period: FunnelPeriod = 'all', now = new Date()) {
  const cutoff = period === 'all' ? null : startOfDay(now).getTime() - (period - 1) * DAY;
  const contacted = leads.filter(wasContacted).filter((l) => {
    if (cutoff === null) return true;
    const t = contactedAt(l);
    return t !== null && t >= cutoff;
  });
  // "Accepted" = accepted your connection request. People you messaged were already connected,
  // so they only count here once they reply.
  const accepted = contacted.filter((l) => (l.send_channel !== 'message' && isConnected(l)) || hasReplied(l)).length;
  const replied = contacted.filter(hasReplied).length;
  return {
    sent: contacted.length,
    accepted,
    replied,
    rate: contacted.length > 0 ? Math.round((replied / contacted.length) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// Message queue: what the extension sent today and what is still waiting.
// ---------------------------------------------------------------------------
export interface QueueRow {
  lead: Lead;
  name: string;
  kind: string;
  state: 'sent' | 'waiting' | 'sending' | 'failed';
}

/** The last thing sent to this person (first message, follow-up or reply) and when. */
export function lastSent(lead: Lead): { at: number; kind: 'first' | 'followup' | 'reply' } | null {
  const opts: Array<{ at: number | null; kind: 'first' | 'followup' | 'reply' }> = [
    { at: lead.send_status === 'sent' || lead.send_kind ? time(lead.send_sent_at) : null, kind: 'first' },
    { at: time(lead.followup_last_sent_at), kind: 'followup' },
    { at: lead.reply_draft_status === 'sent' ? time(lead.reply_sent_at) : null, kind: 'reply' },
  ];
  let best: { at: number; kind: 'first' | 'followup' | 'reply' } | null = null;
  for (const o of opts) if (o.at !== null && (!best || o.at > best.at)) best = { at: o.at, kind: o.kind };
  return best;
}

export function messageQueue(leads: Lead[], now = new Date()): { rows: QueueRow[]; done: number; total: number } {
  const today = startOfDay(now).getTime();
  const kind = (l: Lead) => (l.send_channel === 'message' ? 'Chat message' : 'Connection note');
  const sentKind = (l: Lead, k: 'first' | 'followup' | 'reply') => (k === 'reply' ? 'Reply' : k === 'followup' ? 'Follow-up' : kind(l));
  const sentToday: QueueRow[] = [];
  const open: QueueRow[] = [];
  const sentAt = new Map<number, number>();
  for (const lead of leads) {
    const s = lead.send_status;
    // v4.36.5: replies and follow-ups sent today count too (not only first messages)
    const last = lastSent(lead);
    if (last && last.at >= today && !(s === 'queued' || s === 'sending')) {
      sentToday.push({ lead, name: displayName(lead), kind: sentKind(lead, last.kind), state: 'sent' });
      sentAt.set(lead.id, last.at);
    } else if (s === 'sent') {
      continue;
    } else if (s === 'queued' || s === 'sending' || s === 'failed') {
      open.push({ lead, name: displayName(lead), kind: kind(lead), state: s === 'queued' ? 'waiting' : s });
    }
  }
  const qt = (r: QueueRow) => time(r.lead.send_queued_at) ?? 0;
  open.sort((a, b) => qt(a) - qt(b));
  sentToday.sort((a, b) => (sentAt.get(b.lead.id) ?? 0) - (sentAt.get(a.lead.id) ?? 0));
  return { rows: [...sentToday, ...open], done: sentToday.length, total: sentToday.length + open.filter((r) => r.state !== 'failed').length };
}

// ---------------------------------------------------------------------------
// Follow-up tracker: what needs attention, placed on the day it is due.
// ---------------------------------------------------------------------------
export const FOLLOW_UP_AFTER_DAYS = 7;

export interface FollowUp {
  key: string;
  day: number; // midnight timestamp of the day it shows on
  overdue: boolean;
  kind: 'follow-up' | 'reply' | 'comment';
  title: string;
  detail: string;
  leadId?: number;
  initials?: string;
}

export function followUps(leads: Lead[], posts: CommentPost[], now = new Date()): FollowUp[] {
  const today = startOfDay(now).getTime();
  const items: FollowUp[] = [];
  const place = (due: number) => {
    const d = startOfDay(new Date(due)).getTime();
    return d < today ? { day: today, overdue: true } : { day: d, overdue: false };
  };

  for (const lead of leads) {
    const stage = stageOf(lead);
    const name = displayName(lead);
    if (stage === 'Contacted') {
      const base = time(lead.send_sent_at) ?? time(lead.updated_at);
      if (base === null) continue;
      items.push({
        key: `f${lead.id}`,
        ...place(base + FOLLOW_UP_AFTER_DAYS * DAY),
        kind: 'follow-up',
        title: `Follow up · ${name}`,
        detail: `No reply ${FOLLOW_UP_AFTER_DAYS} days after your message`,
        leadId: lead.id,
      });
    } else if (stage === 'Replied') {
      const base = time(lead.updated_at) ?? time(lead.created_at);
      if (base === null) continue;
      items.push({
        key: `r${lead.id}`,
        ...place(base + DAY),
        kind: 'reply',
        title: `Reply · ${name}`,
        detail: lead.company?.trim() ? `Replied — ${lead.company.trim()}` : 'They replied — answer them',
        leadId: lead.id,
      });
    }
  }

  for (const post of posts) {
    if (post.comment_status !== 'drafted') continue;
    const base = time(post.comment_generated_at) ?? time(post.scraped_at);
    if (base === null) continue;
    items.push({
      key: `c${post.id}`,
      ...place(base),
      kind: 'comment',
      title: `Comment · ${post.author_name?.trim() || 'a post'}`,
      detail: 'Draft ready for review',
    });
  }

  const order = { reply: 0, 'follow-up': 1, comment: 2 } as const;
  return items.sort((a, b) => a.day - b.day || order[a.kind] - order[b.kind]);
}
