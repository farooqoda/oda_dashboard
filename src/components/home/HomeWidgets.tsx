import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ENABLED_TASKS, useExtensionTask, type Task } from '../../lib/extensionBridge';
import { displayName } from '../../lib/format';
import {
  FOLLOW_UP_AFTER_DAYS,
  startOfDay,
  type FollowUp,
  type NetworkNode,
  type QueueRow,
  type DayBar,
} from '../../lib/home';
import { initialsOf } from '../../lib/person';
import { fitScore } from '../../lib/traitsRegistry';
import type { Lead } from '../../lib/types';
import { TASK_INFO, TASK_TONE } from '../TaskPicker';

const DAY = 24 * 60 * 60 * 1000;

/** Small "Name · initials" bubble used across the widgets. */
function Bubble({ name, tone = 'light', size = 'md' }: { name: string; tone?: 'light' | 'dark' | 'sun'; size?: 'sm' | 'md' }) {
  const tones = {
    light: 'bg-slate-100 text-slate-800',
    dark: 'bg-slate-700 text-white',
    sun: 'bg-sun-400 text-ink',
  };
  const sizes = { sm: 'h-7 w-7 text-[10px]', md: 'h-10 w-10 text-xs' };
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tones[tone]} ${sizes[size]}`}>
      {initialsOf(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Headline bars: Found / High fit / Messages to send / Replied
// ---------------------------------------------------------------------------
export function HeadlineBars({ found, highFit, toSend, replied }: { found: number; highFit: number; toSend: number; replied: number }) {
  const items = [
    { label: 'Found', value: found, cls: 'bg-ink text-white' },
    { label: 'High fit', value: highFit, cls: 'bg-sun-400 text-ink' },
    { label: 'Messages to send', value: toSend, cls: 'hatched text-ink' },
    { label: 'Replied', value: replied, cls: 'border border-slate-500 text-ink' },
  ];
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex w-full flex-wrap items-end gap-x-2 gap-y-3 lg:flex-nowrap">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-[96px]"
          // Width follows the number, with a floor so small values stay readable.
          style={{ flexGrow: Math.max(0.6, (item.value / max) * 3), flexBasis: 0 }}
        >
          <p className="mb-2 text-xs text-slate-600">{item.label}</p>
          <div className={`flex h-10 items-center rounded-full px-4 text-sm tabular-nums ${item.cls}`}>
            {item.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggested connection
// ---------------------------------------------------------------------------
export function SuggestedCard({ lead, onOpen }: { lead: Lead | null; onOpen: (id: number) => void }) {
  if (!lead) {
    return (
      <div className="flex min-h-[300px] flex-col justify-end rounded-tile bg-gradient-to-b from-slate-200 to-slate-400 p-6">
        <p className="text-xs text-white/80">Suggested connection</p>
        <p className="mt-1 text-lg font-medium text-white">Everyone has been contacted</p>
        <Link to="/leads" className="mt-3 text-sm text-white underline underline-offset-2">
          Find more people →
        </Link>
      </div>
    );
  }
  const name = displayName(lead);
  const score = fitScore(lead.traits);
  return (
    <div className="relative flex min-h-[300px] flex-col overflow-hidden rounded-tile bg-gradient-to-b from-[#dcdad4] via-[#c9c6bf] to-[#8d8a84]">
      <div className="flex flex-1 items-center justify-center pt-6">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white/40 text-4xl font-light tracking-tight text-ink">
          {initialsOf(name)}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3 bg-gradient-to-t from-black/55 to-transparent p-5 pt-10">
        <div className="min-w-0">
          <p className="text-[11px] text-white/75">Suggested connection</p>
          <p className="truncate text-xl font-medium text-white" title={name}>{name}</p>
          <p className="truncate text-xs text-white/85" title={lead.title ?? undefined}>
            {lead.title?.trim() || lead.company?.trim() || 'No title recorded'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(lead.id)}
          className="shrink-0 rounded-full border border-white/70 px-3.5 py-1.5 text-xs text-white hover:bg-white/15"
        >
          {score !== null ? `Fit ${score} · ` : ''}Connect
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your network
// ---------------------------------------------------------------------------
export function NetworkCard({ nodes, activeThisWeek, onOpen }: { nodes: NetworkNode[]; activeThisWeek: number; onOpen: (id: number) => void }) {
  // Fixed spots around "You", so the picture is stable between visits.
  const spots = [
    { x: 18, y: 22 }, { x: 52, y: 12 }, { x: 84, y: 20 },
    { x: 88, y: 68 }, { x: 54, y: 88 }, { x: 16, y: 72 },
  ];
  return (
    <div className="tile flex min-h-[300px] flex-col">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-normal tracking-tight text-ink">Your network</h2>
        {activeThisWeek > 0 ? (
          <span className="rounded-full bg-sun-400 px-2.5 py-0.5 text-xs text-ink">+{activeThisWeek} this week</span>
        ) : null}
      </div>
      {nodes.length === 0 ? (
        <p className="mt-auto text-sm text-slate-600">
          People appear here once they accept your connection request or reply.
        </p>
      ) : (
        <>
          <div className="relative my-3 flex-1" style={{ minHeight: 180 }}>
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {nodes.map((n, i) => (
                <line
                  key={n.lead.id}
                  x1="50" y1="50" x2={spots[i].x} y2={spots[i].y}
                  stroke={n.replied ? '#f0c419' : '#a9a8ac'}
                  strokeWidth={n.replied ? 0.9 : 0.5}
                  strokeDasharray={n.replied ? undefined : '1.5 1.5'}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-xs font-medium text-white">
              You
            </span>
            {nodes.map((n, i) => (
              <button
                key={n.lead.id}
                type="button"
                title={`${n.name}${n.replied ? ' — replied' : ' — connected'}`}
                onClick={() => onOpen(n.lead.id)}
                className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-semibold ${
                  n.recent ? 'bg-sun-400 text-ink ring-4 ring-sun-100' : 'border border-slate-300 bg-white text-slate-800'
                }`}
                style={{ left: `${spots[i].x}%`, top: `${spots[i].y}%` }}
              >
                {initialsOf(n.name)}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-600">Yellow: active this week. Solid lines: they replied.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outreach: sent per day this week
// ---------------------------------------------------------------------------
export function OutreachCard({ days, total }: { days: DayBar[]; total: number }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const peak = days.reduce((best, d, i) => (d.count > days[best].count ? i : best), 0);
  return (
    <div className="tile flex min-h-[300px] flex-col">
      <div className="flex items-start justify-between">
        <h2 className="text-xl font-normal tracking-tight text-ink">Outreach</h2>
        <Link to="/outreach" aria-label="Open Message Studio" className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink hover:bg-slate-100">
          ↗
        </Link>
      </div>
      <p className="mt-3 flex items-end gap-2">
        <span className="text-4xl font-light tabular-nums tracking-tight text-ink">{total}</span>
        <span className="pb-1 text-xs leading-tight text-slate-600">
          {total === 1 ? 'message' : 'messages'}
          <br />
          sent in the last 7 days
        </span>
      </p>
      <div className="mt-auto flex h-36 items-end justify-between gap-2 pt-4" role="img" aria-label={`Messages sent per day this week: ${days.map((d) => `${d.label} ${d.count}`).join(', ')}`}>
        {days.map((d, i) => {
          const isPeak = i === peak && d.count > 0;
          const h = d.future ? 22 : Math.max(6, (d.count / max) * 100);
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div className="relative flex h-28 w-full items-end justify-center">
                {isPeak ? (
                  <span className="absolute -top-1 rounded-full bg-sun-400 px-1.5 text-[10px] tabular-nums text-ink" style={{ bottom: `${h}%` }}>
                    {d.count}
                  </span>
                ) : null}
                <span
                  title={d.future ? 'Later this week' : `${d.count} sent`}
                  className={`w-2 rounded-full ${d.future ? 'bg-slate-300' : isPeak ? 'bg-sun-500' : 'bg-ink'}`}
                  style={{ height: `${h}%` }}
                />
              </div>
              <span className="text-[11px] text-slate-500">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reply rate: Sent / Accepted / Replied
// ---------------------------------------------------------------------------
export function ReplyRateCard({ sent, accepted, replied, rate }: { sent: number; accepted: number; replied: number; rate: number | null }) {
  const parts = [
    { label: 'Sent', value: sent, cls: 'bg-sun-400 text-ink' },
    { label: 'Accepted', value: accepted, cls: 'bg-ink text-white' },
    { label: 'Replied', value: replied, cls: 'bg-slate-400 text-white' },
  ];
  const sum = Math.max(1, sent);
  return (
    <div className="tile">
      <div className="flex items-start justify-between">
        <h2 className="text-xl font-normal tracking-tight text-ink">Reply rate</h2>
        <span className="text-4xl font-light tabular-nums tracking-tight text-ink">{rate === null ? '—' : `${rate}%`}</span>
      </div>
      <div className="mt-4 flex items-end gap-1.5">
        {parts.map((p) => (
          <div key={p.label} className="min-w-[44px]" style={{ flexGrow: Math.max(0.35, p.value / sum), flexBasis: 0 }}>
            <p className="mb-1.5 text-xs text-slate-600">{p.label}</p>
            <div className={`flex h-9 items-center rounded-full px-3 text-xs tabular-nums ${p.cls}`}>{p.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message queue (dark)
// ---------------------------------------------------------------------------
export function QueueCard({ rows, done, total, onOpen }: { rows: QueueRow[]; done: number; total: number; onOpen: (id: number) => void }) {
  return (
    <div className="tile-dark flex flex-1 flex-col">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-normal tracking-tight">Message queue</h2>
        <span className="text-3xl font-light tabular-nums">
          {done}/{total}
        </span>
      </div>
      <p className="mt-1 text-xs text-white/55">Sent today / sent today plus waiting</p>
      {rows.length === 0 ? (
        <div className="mt-6 text-sm text-white/70">
          Nothing queued.{' '}
          <Link to="/outreach" className="text-sun-400 underline underline-offset-2">
            Open Message Studio
          </Link>{' '}
          to pick who to message.
        </div>
      ) : (
        <ul className="mt-4 space-y-1 overflow-y-auto" style={{ maxHeight: 420 }}>
          {rows.slice(0, 12).map((r) => (
            <li key={r.lead.id}>
              <button type="button" onClick={() => onOpen(r.lead.id)} className="flex w-full items-center gap-3 rounded-2xl px-1 py-2 text-left hover:bg-white/5">
                <Bubble name={r.name} tone="dark" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${r.state === 'sent' ? 'text-white/60 line-through' : 'text-white'}`}>{r.name}</span>
                  <span className="block truncate text-xs text-white/50">
                    {r.kind}
                    {r.state === 'failed' ? ' · failed' : r.state === 'sending' ? ' · sending…' : ''}
                  </span>
                </span>
                {r.state === 'sent' ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sun-400 text-[11px] text-ink" aria-label="Sent">✓</span>
                ) : r.state === 'failed' ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-critical text-[11px] text-white" aria-label="Failed">!</span>
                ) : (
                  <span className="h-5 w-5 rounded-full bg-white/15" aria-label="Waiting" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 12 ? (
        <Link to="/outreach" className="mt-3 text-xs text-white/70 underline underline-offset-2">
          {rows.length - 12} more in Message Studio
        </Link>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modules: the four tasks as an accordion
// ---------------------------------------------------------------------------
const MODULE_ORDER: Task[] = ['lead_scraper', 'post_scraper', 'comment_poster', 'message_sender'];
const MODULE_LINK: Record<Task, string> = {
  lead_scraper: '/leads',
  post_scraper: '/posts',
  comment_poster: '/comments',
  message_sender: '/outreach',
};

export function ModulesCard() {
  const { status, task, pending, refused, chooseTask, recheck } = useExtensionTask();
  const active = status === 'connected' ? task : null;
  const [open, setOpen] = useState<Task | null>(null);
  const shown = open ?? active ?? 'message_sender';

  return (
    <div className="tile">
      {status === 'missing' ? (
        <p className="mb-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          The extension (“GAB LinkedIn Assistant” in Tampermonkey) is not running in this browser.{' '}
          <button type="button" className="font-medium underline" onClick={recheck}>
            Check again
          </button>
        </p>
      ) : null}
      {refused ? (
        <p className="mb-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          Your extension did not accept “{TASK_INFO[refused].title}”. Install the latest version, then reload.
        </p>
      ) : null}
      <ul className="divide-y divide-dashed divide-slate-300">
        {MODULE_ORDER.map((key) => {
          const info = TASK_INFO[key];
          const isOpen = shown === key;
          const isActive = active === key;
          const enabled = ENABLED_TASKS.includes(key);
          return (
            <li key={key} className="py-3 first:pt-0 last:pb-0">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : key)}
              >
                <span className="flex items-center gap-2 text-base text-ink">
                  <span className={`h-2 w-2 rounded-full ${TASK_TONE[key].button.split(' ').find((c) => c.startsWith('bg-')) ?? 'bg-ink'}`} aria-hidden="true" />
                  {info.title}
                  {isActive ? <span className="rounded-full bg-sun-400 px-2 py-0.5 text-[10px] text-ink">Active</span> : null}
                </span>
                <span className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
              </button>
              {isOpen ? (
                <div className="mt-2">
                  <p className="text-sm leading-relaxed text-slate-600">{info.description}</p>
                  {isActive ? <p className="mt-2 text-xs leading-relaxed text-slate-700">{info.nextStep}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isActive ? (
                      <span className="text-xs font-medium text-ink">Selected ✓</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={!enabled || status !== 'connected' || pending === key}
                        onClick={() => chooseTask(key)}
                        title={status !== 'connected' ? 'The extension is not detected in this browser' : undefined}
                      >
                        {pending === key ? 'Switching…' : 'Use this task →'}
                      </button>
                    )}
                    <Link to={MODULE_LINK[key]} className="text-xs text-slate-700 underline underline-offset-2">
                      Open page
                    </Link>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-up tracker: a Mon–Sun week, items placed on the day they are due
// ---------------------------------------------------------------------------
function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const back = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - back);
  return x;
}

export function FollowUpTracker({ items, onOpen }: { items: FollowUp[]; onOpen: (id: number) => void }) {
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const today = startOfDay(new Date()).getTime();
  const monday = useMemo(() => {
    const m = mondayOf(new Date());
    m.setDate(m.getDate() + offset * 7);
    return m;
  }, [offset]);
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * DAY));
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const range = `${fmt(days[0])}–${days[6].getMonth() === days[0].getMonth() ? days[6].getDate() : fmt(days[6])}`;

  const byDay = days.map((d) => items.filter((it) => it.day === d.getTime()));
  const count = byDay.reduce((n, list) => n + list.length, 0);

  const chip = (it: FollowUp) => {
    const cls =
      it.kind === 'comment'
        ? 'bg-sun-400 text-ink'
        : it.kind === 'reply'
          ? 'bg-ink text-white'
          : 'border border-slate-200 bg-white text-ink';
    // "Reply · Priya Shah" → kind on the small line, the name on its own line.
    const [kindLabel, ...rest] = it.title.split(' · ');
    const who = rest.join(' · ') || it.title;
    const body = (
      <>
        <span className="block text-xs font-medium leading-snug [overflow-wrap:anywhere]">{who}</span>
        <span className={`block truncate text-[11px] ${it.kind === 'reply' ? 'text-white/70' : 'text-slate-600'}`}>
          {kindLabel}
          {it.overdue ? ' · overdue' : ''}
        </span>
      </>
    );
    return it.leadId !== undefined ? (
      <button key={it.key} type="button" onClick={() => onOpen(it.leadId!)} className={`w-full rounded-2xl px-2.5 py-2 text-left ${cls}`} title={`${it.title} — ${it.detail}`}>
        {body}
      </button>
    ) : (
      <Link key={it.key} to="/comments" className={`block w-full rounded-2xl px-2.5 py-2 text-left ${cls}`} title={`${it.title} — ${it.detail}`}>
        {body}
      </Link>
    );
  };

  return (
    <div className="tile flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="rounded-full bg-white px-3 py-1 text-xs text-slate-800 hover:bg-slate-100" onClick={() => { setOffset((o) => o - 1); setExpanded(null); }}>
          ‹ Last week
        </button>
        <h2 className="text-center text-base font-normal text-ink sm:text-lg">
          Follow-up tracker · {range}
        </h2>
        <button type="button" className="rounded-full bg-white px-3 py-1 text-xs text-slate-800 hover:bg-slate-100" onClick={() => { setOffset((o) => o + 1); setExpanded(null); }}>
          Next week ›
        </button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-7 gap-1.5">
          {days.map((d, i) => {
            const isToday = d.getTime() === today;
            return (
              <div key={i} className="flex min-h-[220px] flex-col border-l border-slate-200 pl-2 first:border-l-0 first:pl-0">
                <div className="mb-2 text-center">
                  <p className={`text-xs ${isToday ? 'font-semibold text-ink' : 'text-slate-500'}`}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums ${isToday ? 'bg-ink text-white' : 'text-slate-600'}`}>
                    {d.getDate()}
                  </p>
                </div>
                <div className="space-y-1.5">{(expanded === i ? byDay[i] : byDay[i].slice(0, 4)).map(chip)}</div>
                {byDay[i].length > 4 ? (
                  <button
                    type="button"
                    className="mt-1 w-full text-center text-[11px] text-slate-600 underline underline-offset-2"
                    onClick={() => setExpanded(expanded === i ? null : i)}
                  >
                    {expanded === i ? 'Show less' : `+${byDay[i].length - 4} more`}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        {count === 0 ? 'Nothing due this week. ' : ''}
        Follow-ups are suggested {FOLLOW_UP_AFTER_DAYS} days after a message with no reply; replies and comment drafts show as soon as they arrive.
      </p>
    </div>
  );
}
