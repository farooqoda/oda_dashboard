import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../data/AuthProvider';
import { useLeads } from '../data/LeadsProvider';
import { AP_READY_CHANGED, loadReadyCount } from '../lib/autopilot';
import { bellCount, todayItems, withWarmLeads, type TodayItem } from '../lib/today';
import { useAutomation } from './Automation';

/** Warm leads waiting for approval (one shared, cached request for every Today/bell on the page). */
function useWarmLeadsReady(userId: string | null) {
  const [ready, setReady] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const load = (force = false) => void loadReadyCount(force).then((n) => live && setReady(n));
    load();
    const onChange = () => load(true);
    window.addEventListener(AP_READY_CHANGED, onChange);
    const t = window.setInterval(() => load(true), 5 * 60 * 1000);
    return () => {
      live = false;
      window.removeEventListener(AP_READY_CHANGED, onChange);
      window.clearInterval(t);
    };
  }, [userId]);
  return ready;
}

export function useToday() {
  const { leads } = useLeads();
  const { user } = useAuth();
  const { settings } = useAutomation();
  const ready = useWarmLeadsReady(user?.id ?? null);
  const items = useMemo(() => withWarmLeads(todayItems(leads, user?.id ?? null, settings), ready), [leads, user, settings, ready]);
  return { items, count: bellCount(items) };
}

const TONE: Record<TodayItem['tone'], string> = {
  red: 'border-red-200 bg-red-50 text-red-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  slate: 'border-slate-200 bg-slate-50 text-slate-800',
};

function ItemLink({ item, className, onClick }: { item: TodayItem; className: string; onClick?: () => void }) {
  const body = (
    <>
      <span aria-hidden="true" className="shrink-0">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">{item.text}</span>
      <span aria-hidden="true" className="shrink-0 text-slate-400">
        →
      </span>
    </>
  );
  return /^https:\/\//.test(item.to) ? (
    <a href={item.to} target="_blank" rel="noreferrer" className={className} onClick={onClick}>
      {body}
    </a>
  ) : (
    <Link to={item.to} className={className} onClick={onClick}>
      {body}
    </Link>
  );
}

/** Dashboard: what needs you today. */
export function TodayCard() {
  const { items } = useToday();
  return (
    <section aria-labelledby="today-h" className="card mb-6 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="today-h" className="text-base font-semibold text-slate-900">
          Today
        </h2>
        <span className="text-xs text-slate-500">Also in your morning email</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing needs you right now. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.key}>
              <ItemLink item={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm hover:brightness-95 ${TONE[i.tone]}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Top bar: 🔔 with the number of things to do, and the list. */
export function Bell() {
  const { items, count } = useToday();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={count ? `Today: ${count} thing${count === 1 ? '' : 's'} to do` : 'Today: nothing to do'}
        aria-expanded={open}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-lg"
      >
        <span aria-hidden="true">🔔</span>
        {count ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.25rem] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-5 text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="fixed left-4 right-4 top-20 z-40 rounded-2xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem] border border-slate-200 bg-white p-2 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
          <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">Today</p>
          {items.length === 0 ? (
            <p className="px-3 pb-3 text-sm text-slate-600">Nothing needs you right now. 🎉</p>
          ) : (
            <ul>
              {items.map((i) => (
                <li key={i.key}>
                  <ItemLink item={i} className="flex items-start gap-2 rounded-xl px-3 py-2 text-sm text-slate-800 hover:bg-slate-100" onClick={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Message Studio: queued work that will not start by itself (⚡ off, or the extension not seen). */
export function AutoStartNotice() {
  const { items } = useToday();
  const shown = items.filter((i) => i.key === 'auto_off' || i.key === 'ext_missing');
  if (!shown.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {shown.map((i) => (
        <ItemLink key={i.key} item={i} className={`flex items-start gap-2 rounded-md border px-4 py-2.5 text-sm ${TONE[i.tone]}`} />
      ))}
    </div>
  );
}
