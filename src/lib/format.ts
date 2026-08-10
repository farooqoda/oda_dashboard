import { FIT_HIGH, FIT_MID } from './constants';
import type { Lead } from './types';

export function initials(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function displayName(lead: Lead): string {
  return lead.full_name?.trim() || 'Unnamed lead';
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const compactDateFmt = new Intl.DateTimeFormat(undefined, {
  year: '2-digit',
  month: 'short',
  day: 'numeric',
});

/** Narrow form for the dense table, where the column is only a few characters wide. */
export function formatDateCompact(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : compactDateFmt.format(d);
}

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dateTimeFmt.format(d);
}

/** Local calendar day as YYYY-MM-DD, used to bucket the created-over-time line. */
export function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type FitBand = 'high' | 'mid' | 'low';

export function fitBand(score: number): FitBand {
  if (score >= FIT_HIGH) return 'high';
  if (score >= FIT_MID) return 'mid';
  return 'low';
}

/** Tinted chip styles. Text is dark ink on a light tint, never the raw status hue. */
export const FIT_BAND_CLASSES: Record<FitBand, string> = {
  high: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  mid: 'bg-amber-50 text-amber-800 border-amber-200',
  low: 'bg-red-50 text-red-800 border-red-200',
};

/** Fixed status hues, used for the gauge/meter fill only. */
export const FIT_BAND_FILL: Record<FitBand, string> = {
  high: '#0ca30c',
  mid: '#fab219',
  low: '#d03b3b',
};

export const FIT_BAND_LABEL: Record<FitBand, string> = {
  high: `High fit (${FIT_HIGH}+)`,
  mid: `Medium fit (${FIT_MID}–${FIT_HIGH - 1})`,
  low: `Low fit (under ${FIT_MID})`,
};

/**
 * Muted pill palette for personality types. Assignment is by a stable hash of
 * the type string, so a given type keeps its colour everywhere in the app and
 * across sessions — colour follows the entity, never its position in a list.
 */
const TYPE_PILL_CLASSES = [
  'bg-blue-50 text-blue-800 border-blue-200',
  'bg-violet-50 text-violet-800 border-violet-200',
  'bg-teal-50 text-teal-800 border-teal-200',
  'bg-orange-50 text-orange-800 border-orange-200',
  'bg-pink-50 text-pink-800 border-pink-200',
  'bg-lime-50 text-lime-800 border-lime-200',
  'bg-cyan-50 text-cyan-800 border-cyan-200',
  'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200',
];

export function typePillClass(type: string | null | undefined): string {
  if (!type) return 'bg-slate-100 text-slate-600 border-slate-200';
  let hash = 0;
  for (let i = 0; i < type.length; i += 1) {
    hash = (hash * 31 + type.charCodeAt(i)) >>> 0;
  }
  return TYPE_PILL_CLASSES[hash % TYPE_PILL_CLASSES.length];
}

export const STAGE_PILL_CLASSES: Record<string, string> = {
  'New Lead': 'bg-slate-100 text-slate-700 border-slate-200',
  Contacted: 'bg-brand-50 text-brand-800 border-brand-200',
  Replied: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Interested: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  'Meeting Scheduled': 'bg-violet-50 text-violet-800 border-violet-200',
  Won: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Lost: 'bg-red-50 text-red-800 border-red-200',
};

export function stagePillClass(stage: string | null | undefined): string {
  if (!stage) return 'bg-slate-100 text-slate-600 border-slate-200';
  return STAGE_PILL_CLASSES[stage] ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

/** review_status is free text; this is the "still needs a human" test. */
export function needsReview(lead: Lead): boolean {
  const value = lead.review_status?.trim().toLowerCase();
  if (!value) return false;
  return value.includes('need') || value === 'pending' || value === 'unreviewed';
}

export function isProfiled(lead: Lead): boolean {
  return !!lead.traits && Object.keys(lead.traits).length > 0;
}

export function stageOf(lead: Lead): string {
  return lead.stage?.trim() || 'New Lead';
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
