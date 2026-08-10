import { DEFAULT_STAGE, ODA_BUCKETS, PIPELINE_STAGES } from './constants';
import { dayKey, isProfiled, needsReview, stageOf } from './format';
import { fitScore, odaBucket, personalityType, traitsSearchText } from './traitsRegistry';
import type { Lead } from './types';

export const UNBUCKETED = 'Unbucketed';
export const UNTYPED = 'No type recorded';

/** A bucket value the profiling step returned that is not one of the ten. */
export function bucketOf(lead: Lead): string {
  return odaBucket(lead.traits) ?? UNBUCKETED;
}

export function isKnownBucket(value: string): boolean {
  return (ODA_BUCKETS as readonly string[]).includes(value);
}

/**
 * Counts for all ten buckets, always, plus one extra row per off-list value
 * actually seen (including "Unbucketed"). The ten never disappear.
 */
export function bucketCounts(leads: Lead[]): Array<{ bucket: string; count: number; known: boolean }> {
  const counts = new Map<string, number>();
  for (const bucket of ODA_BUCKETS) counts.set(bucket, 0);

  let unbucketed = 0;
  const extra = new Map<string, number>();

  for (const lead of leads) {
    const bucket = odaBucket(lead.traits);
    if (!bucket) {
      unbucketed += 1;
    } else if (counts.has(bucket)) {
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    } else {
      extra.set(bucket, (extra.get(bucket) ?? 0) + 1);
    }
  }

  const rows: Array<{ bucket: string; count: number; known: boolean }> = ODA_BUCKETS.map(
    (bucket) => ({
      bucket: bucket as string,
      count: counts.get(bucket) ?? 0,
      known: true,
    }),
  );

  for (const [bucket, count] of [...extra.entries()].sort((a, b) => b[1] - a[1])) {
    rows.push({ bucket, count, known: false });
  }
  if (unbucketed > 0) rows.push({ bucket: UNBUCKETED, count: unbucketed, known: false });

  return rows;
}

/** Counts for all seven stages, always, plus any off-list stage found in data. */
export function stageCounts(leads: Lead[]): Array<{ stage: string; count: number; known: boolean }> {
  const counts = new Map<string, number>();
  for (const stage of PIPELINE_STAGES) counts.set(stage, 0);
  const extra = new Map<string, number>();

  for (const lead of leads) {
    const stage = stageOf(lead);
    if (counts.has(stage)) counts.set(stage, (counts.get(stage) ?? 0) + 1);
    else extra.set(stage, (extra.get(stage) ?? 0) + 1);
  }

  const rows = PIPELINE_STAGES.map((stage) => ({
    stage: stage as string,
    count: counts.get(stage) ?? 0,
    known: true,
  }));
  for (const [stage, count] of [...extra.entries()].sort((a, b) => b[1] - a[1])) {
    rows.push({ stage, count, known: false });
  }
  return rows;
}

export function personalityTypeCounts(leads: Lead[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const type = personalityType(lead.traits) ?? UNTYPED;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/** Distinct personality types present, for the filter dropdown. */
export function personalityTypeOptions(leads: Lead[]): string[] {
  const set = new Set<string>();
  for (const lead of leads) {
    const type = personalityType(lead.traits);
    if (type) set.add(type);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function reviewStatusOptions(leads: Lead[]): string[] {
  const set = new Set<string>();
  for (const lead of leads) {
    const value = lead.review_status?.trim();
    if (value) set.add(value);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Ten-point histogram of fit scores. Empty when nothing carries a score. */
export function fitScoreHistogram(leads: Lead[]): Array<{ label: string; count: number }> {
  const bins = Array.from({ length: 10 }, (_, i) => ({
    label: i === 9 ? '90–100' : `${i * 10}–${i * 10 + 9}`,
    count: 0,
  }));
  for (const lead of leads) {
    const score = fitScore(lead.traits);
    if (score === null) continue;
    const clamped = Math.max(0, Math.min(100, score));
    const index = Math.min(9, Math.floor(clamped / 10));
    bins[index].count += 1;
  }
  return bins;
}

/** Leads per calendar day, gap-filled so the line has no false straight runs. */
export function leadsPerDay(leads: Lead[]): Array<{ day: string; count: number }> {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const key = dayKey(lead.created_at);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const keys = [...counts.keys()].sort();
  const start = new Date(`${keys[0]}T00:00:00`);
  const end = new Date(`${keys[keys.length - 1]}T00:00:00`);
  const out: Array<{ day: string; count: number }> = [];

  // Cap the gap fill so a single ancient row cannot generate thousands of days.
  const maxDays = 400;
  let cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < maxDays) {
    const key = dayKey(cursor.toISOString());
    if (key) out.push({ day: key, count: counts.get(key) ?? 0 });
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    guard += 1;
  }
  if (guard >= maxDays) {
    // Too wide a range to gap-fill: fall back to only the days that exist.
    return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }));
  }
  return out;
}

export interface DashboardStats {
  total: number;
  profiled: number;
  highFit: number;
  needsReview: number;
  createdLast7: number;
  createdPrev7: number;
  /** Null when there is not enough history to make the comparison honest. */
  weekOverWeekDelta: number | null;
}

export function dashboardStats(leads: Lead[]): DashboardStats {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  let profiled = 0;
  let highFit = 0;
  let review = 0;
  let last7 = 0;
  let prev7 = 0;
  let oldestCreated = Number.POSITIVE_INFINITY;

  for (const lead of leads) {
    if (isProfiled(lead)) profiled += 1;
    const score = fitScore(lead.traits);
    if (score !== null && score >= 70) highFit += 1;
    if (needsReview(lead)) review += 1;

    if (lead.created_at) {
      const t = new Date(lead.created_at).getTime();
      if (!Number.isNaN(t)) {
        oldestCreated = Math.min(oldestCreated, t);
        const age = now - t;
        if (age >= 0 && age < 7 * day) last7 += 1;
        else if (age >= 7 * day && age < 14 * day) prev7 += 1;
      }
    }
  }

  // Only claim a week-over-week change when there is a full prior week of data
  // to compare against. Otherwise the number is an artefact of when collection
  // started, and we show nothing instead.
  const hasPriorWeek = Number.isFinite(oldestCreated) && now - oldestCreated >= 14 * day;
  const weekOverWeekDelta = hasPriorWeek && prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : null;

  return {
    total: leads.length,
    profiled,
    highFit,
    needsReview: review,
    createdLast7: last7,
    createdPrev7: prev7,
    weekOverWeekDelta,
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export interface LeadFilters {
  search: string;
  buckets: string[];
  stages: string[];
  fitMin: number;
  fitMax: number;
  /** Keep leads with no fit_score at all. Off when the range is narrowed. */
  includeUnscored: boolean;
  personalityTypes: string[];
  reviewStatuses: string[];
  hasEmail: 'any' | 'yes' | 'no';
}

export const EMPTY_FILTERS: LeadFilters = {
  search: '',
  buckets: [],
  stages: [],
  fitMin: 0,
  fitMax: 100,
  includeUnscored: true,
  personalityTypes: [],
  reviewStatuses: [],
  hasEmail: 'any',
};

export function isFilterActive(filters: LeadFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.buckets.length > 0 ||
    filters.stages.length > 0 ||
    filters.fitMin > 0 ||
    filters.fitMax < 100 ||
    !filters.includeUnscored ||
    filters.personalityTypes.length > 0 ||
    filters.reviewStatuses.length > 0 ||
    filters.hasEmail !== 'any'
  );
}

/** Search haystack: name, company, title, and every value inside traits. */
function searchHaystack(lead: Lead): string {
  return [
    lead.full_name ?? '',
    lead.company ?? '',
    lead.title ?? '',
    traitsSearchText(lead.traits),
  ]
    .join(' ')
    .toLowerCase();
}

export function filterLeads(leads: Lead[], filters: LeadFilters): Lead[] {
  const terms = filters.search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return leads.filter((lead) => {
    if (terms.length > 0) {
      const haystack = searchHaystack(lead);
      if (!terms.every((term) => haystack.includes(term))) return false;
    }

    if (filters.buckets.length > 0 && !filters.buckets.includes(bucketOf(lead))) return false;

    if (filters.stages.length > 0 && !filters.stages.includes(stageOf(lead))) return false;

    const score = fitScore(lead.traits);
    if (score === null) {
      if (!filters.includeUnscored) return false;
    } else if (score < filters.fitMin || score > filters.fitMax) {
      return false;
    }

    if (filters.personalityTypes.length > 0) {
      const type = personalityType(lead.traits) ?? UNTYPED;
      if (!filters.personalityTypes.includes(type)) return false;
    }

    if (filters.reviewStatuses.length > 0) {
      const value = lead.review_status?.trim() ?? '';
      if (!filters.reviewStatuses.includes(value)) return false;
    }

    if (filters.hasEmail === 'yes' && !lead.email?.trim()) return false;
    if (filters.hasEmail === 'no' && !!lead.email?.trim()) return false;

    return true;
  });
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortKey =
  | 'full_name'
  | 'title'
  | 'company'
  | 'bucket'
  | 'fit_score'
  | 'type'
  | 'stage'
  | 'created_at';

export type SortDirection = 'asc' | 'desc';

function sortValue(lead: Lead, key: SortKey): string | number | null {
  switch (key) {
    case 'full_name':
      return lead.full_name?.toLowerCase() ?? null;
    case 'title':
      return lead.title?.toLowerCase() ?? null;
    case 'company':
      return lead.company?.toLowerCase() ?? null;
    case 'bucket':
      return odaBucket(lead.traits)?.toLowerCase() ?? null;
    case 'fit_score':
      return fitScore(lead.traits);
    case 'type':
      return personalityType(lead.traits)?.toLowerCase() ?? null;
    case 'stage': {
      const index = (PIPELINE_STAGES as readonly string[]).indexOf(stageOf(lead));
      return index === -1 ? PIPELINE_STAGES.length : index;
    }
    case 'created_at': {
      if (!lead.created_at) return null;
      const t = new Date(lead.created_at).getTime();
      return Number.isNaN(t) ? null : t;
    }
    default:
      return null;
  }
}

/** Missing values always sort last, in both directions — they are not "lowest". */
export function sortLeads(leads: Lead[], key: SortKey, direction: SortDirection): Lead[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...leads].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === null && bv === null) return a.id - b.id;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  });
}

/** The Outreach queue: an invite message exists and the lead is still New Lead. */
export function outreachQueue(leads: Lead[]): Lead[] {
  return leads.filter(
    (lead) => !!lead.invite_message?.trim() && stageOf(lead) === DEFAULT_STAGE,
  );
}

export function repliedCount(leads: Lead[]): number {
  const repliedStages = new Set(['Replied', 'Interested', 'Meeting Scheduled', 'Won']);
  return leads.filter((lead) => repliedStages.has(stageOf(lead))).length;
}
