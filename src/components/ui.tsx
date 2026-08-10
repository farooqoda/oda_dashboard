import { useEffect, useState, type ReactNode } from 'react';
import {
  FIT_BAND_CLASSES,
  FIT_BAND_FILL,
  fitBand,
  initials,
  stagePillClass,
  typePillClass,
} from '../lib/format';
import type { FriendlyError } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Identity marks
// ---------------------------------------------------------------------------

export function Avatar({
  name,
  size = 'md',
}: {
  name: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'h-7 w-7 text-[11px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-14 w-14 text-lg',
  } as const;
  return (
    <span
      aria-hidden="true"
      className={`${sizes[size]} inline-flex shrink-0 items-center justify-center rounded-full border border-brand-100 bg-brand-50 font-semibold text-brand-800`}
    >
      {initials(name)}
    </span>
  );
}

export function TypePill({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  return <span className={`pill ${typePillClass(type)}`}>{type}</span>;
}

export function StagePill({ stage }: { stage: string | null | undefined }) {
  if (!stage) return null;
  return <span className={`pill ${stagePillClass(stage)}`}>{stage}</span>;
}

export function FitBadge({ score, emptyLabel }: { score: number | null; emptyLabel?: string }) {
  if (score === null) {
    return <span className="text-sm text-slate-400">{emptyLabel ?? '—'}</span>;
  }
  const band = fitBand(score);
  return (
    <span className={`pill ${FIT_BAND_CLASSES[band]} tabular-nums`}>
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: FIT_BAND_FILL[band] }}
      />
      {Math.round(score)}
    </span>
  );
}

/**
 * Fit score meter. The fill carries severity; the track is a light step of the
 * same idea. The number is always rendered beside it, so colour never carries
 * the value on its own.
 */
export function FitGauge({ score }: { score: number }) {
  const band = fitBand(score);
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums text-slate-900">
          {Math.round(score)}
          <span className="ml-1 text-sm font-normal text-slate-500">/ 100</span>
        </span>
        <span className={`pill ${FIT_BAND_CLASSES[band]}`}>
          {band === 'high' ? 'High fit' : band === 'mid' ? 'Medium fit' : 'Low fit'}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: FIT_BAND_FILL[band] }}
        />
      </div>
    </div>
  );
}

/** Small 0-100 bar used for Big Five facets. */
export function FacetBar({ label, pct, raw }: { label: string; pct: number; raw: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-sm text-slate-700">{label}</span>
        <span className="text-xs tabular-nums text-slate-500">{raw}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'danger' }) {
  const cls =
    tone === 'danger'
      ? 'bg-red-50 text-red-800 border-red-200'
      : 'bg-slate-50 text-slate-700 border-slate-200';
  return <span className={`pill ${cls}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div>
            {title ? <h2 className="text-sm font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function ErrorState({ error, onRetry }: { error: FriendlyError; onRetry?: () => void }) {
  return (
    <div className="card border-red-200 bg-red-50/50 p-5">
      <h3 className="text-sm font-semibold text-red-900">Could not load data from Supabase</h3>
      <p className="mt-2 break-words font-mono text-xs text-red-900">{error.message}</p>
      {error.code ? (
        <p className="mt-1 font-mono text-[11px] text-red-700">code: {error.code}</p>
      ) : null}
      {error.hint ? <p className="mt-3 text-sm text-red-900">{error.hint}</p> : null}
      {onRetry ? (
        <button type="button" className="btn-secondary mt-4" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-slate-600">{children}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function InlineError({ error }: { error: FriendlyError }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
      <p className="font-medium">Save failed — the change was reverted.</p>
      <p className="mt-1 break-words font-mono">{error.message}</p>
      {error.hint ? <p className="mt-1">{error.hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeletons (never spinners)
// ---------------------------------------------------------------------------

export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-3 h-8 w-16" />
          <div className="skeleton mt-3 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="skeleton h-3 w-40" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="skeleton h-9 w-9 rounded-full" />
            <div className="flex-1">
              <div className="skeleton h-3 w-48" />
              <div className="skeleton mt-2 h-3 w-32" />
            </div>
            <div className="skeleton hidden h-3 w-24 sm:block" />
            <div className="skeleton hidden h-5 w-16 rounded-full md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-center gap-3">
            <div className="skeleton h-9 w-9 rounded-full" />
            <div className="flex-1">
              <div className="skeleton h-3 w-32" />
              <div className="skeleton mt-2 h-3 w-24" />
            </div>
          </div>
          <div className="skeleton mt-4 h-3 w-full" />
          <div className="skeleton mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBoard() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="w-72 shrink-0">
          <div className="skeleton h-8 w-full rounded-md" />
          <div className="mt-3 space-y-3">
            {Array.from({ length: 3 }).map((__, j) => (
              <div key={j} className="card p-3">
                <div className="skeleton h-3 w-28" />
                <div className="skeleton mt-2 h-3 w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 220 }: { height?: number }) {
  return <div className="skeleton w-full" style={{ height }} />;
}

// ---------------------------------------------------------------------------
// Copy button
// ---------------------------------------------------------------------------

export function CopyButton({
  text,
  label = 'Copy',
  className = 'btn-secondary',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = window.setTimeout(() => setState('idle'), 1800);
    return () => window.clearTimeout(t);
  }, [state]);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Older browsers and non-secure origins have no async clipboard.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  return (
    <button type="button" className={className} onClick={copy}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}

/** Text that truncates with a native tooltip carrying the full value. */
export function Truncate({ text, className = '' }: { text: string | null; className?: string }) {
  if (!text) return <span className="text-slate-400">—</span>;
  return (
    <span className={`block truncate ${className}`} title={text}>
      {text}
    </span>
  );
}

/** A field that exists in the schema but has no value on this row. */
export function NotCaptured() {
  return <span className="text-sm italic text-slate-400">Not captured</span>;
}
