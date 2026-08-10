import { personalityType } from '../lib/traitsRegistry';
import {
  bucketCounts,
  personalityTypeOptions,
  reviewStatusOptions,
  stageCounts,
  UNTYPED,
  type LeadFilters,
} from '../lib/selectors';
import type { Lead } from '../lib/types';

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function CheckRow({
  label,
  count,
  checked,
  onChange,
  muted = false,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
  muted?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      <span className={`min-w-0 flex-1 truncate text-sm ${muted ? 'text-slate-500' : 'text-slate-700'}`} title={label}>
        {label}
      </span>
      {count !== undefined ? (
        <span className="shrink-0 text-xs tabular-nums text-slate-500">{count}</span>
      ) : null}
    </label>
  );
}

/**
 * All ten ODA buckets and all seven stages are listed permanently, with live
 * counts — including zeros. The list is never derived from the rows on screen.
 */
export function FilterPanel({
  leads,
  filters,
  onChange,
  onReset,
}: {
  leads: Lead[];
  filters: LeadFilters;
  onChange: (next: LeadFilters) => void;
  onReset: () => void;
}) {
  const buckets = bucketCounts(leads);
  const stages = stageCounts(leads);
  const types = personalityTypeOptions(leads);
  const reviewStatuses = reviewStatusOptions(leads);

  const typeCount = (type: string) =>
    leads.filter((l) => {
      const value = personalityType(l.traits);
      return type === UNTYPED ? !value : value === type;
    }).length;

  const set = (patch: Partial<LeadFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="card divide-y divide-slate-200">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
        <button type="button" className="btn-ghost text-xs" onClick={onReset}>
          Reset
        </button>
      </div>

      <section className="px-4 py-3">
        <h3 className="label mb-2">Bucket</h3>
        {/* Deliberately not scrollable: all ten buckets stay visible at once. */}
        <div>
          {buckets.map((row) => (
            <CheckRow
              key={row.bucket}
              label={row.bucket}
              count={row.count}
              muted={!row.known}
              checked={filters.buckets.includes(row.bucket)}
              onChange={() => set({ buckets: toggle(filters.buckets, row.bucket) })}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          All ten ODA buckets are always listed. Greyed rows are values found in the data that are
          not one of the ten.
        </p>
      </section>

      <section className="px-4 py-3">
        <h3 className="label mb-2">Stage</h3>
        {stages.map((row) => (
          <CheckRow
            key={row.stage}
            label={row.stage}
            count={row.count}
            muted={!row.known}
            checked={filters.stages.includes(row.stage)}
            onChange={() => set({ stages: toggle(filters.stages, row.stage) })}
          />
        ))}
      </section>

      <section className="px-4 py-3">
        <h3 className="label mb-2">Fit score</h3>
        <div className="flex items-baseline justify-between text-xs text-slate-600">
          <span className="tabular-nums">{filters.fitMin}</span>
          <span className="tabular-nums">{filters.fitMax}</span>
        </div>
        <label className="mt-1 block">
          <span className="sr-only">Minimum fit score</span>
          <input
            type="range"
            min={0}
            max={100}
            value={filters.fitMin}
            onChange={(e) => {
              const value = Number(e.target.value);
              set({ fitMin: Math.min(value, filters.fitMax) });
            }}
            className="w-full"
          />
        </label>
        <label className="block">
          <span className="sr-only">Maximum fit score</span>
          <input
            type="range"
            min={0}
            max={100}
            value={filters.fitMax}
            onChange={(e) => {
              const value = Number(e.target.value);
              set({ fitMax: Math.max(value, filters.fitMin) });
            }}
            className="w-full"
          />
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={filters.includeUnscored}
            onChange={() => set({ includeUnscored: !filters.includeUnscored })}
            className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-slate-700">Include leads with no fit score</span>
        </label>
      </section>

      <section className="px-4 py-3">
        <h3 className="label mb-2">Personality type</h3>
        {types.length === 0 ? (
          <p className="text-sm text-slate-500">No personality types recorded in the loaded rows.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto pr-1">
            {types.map((type) => (
              <CheckRow
                key={type}
                label={type}
                count={typeCount(type)}
                checked={filters.personalityTypes.includes(type)}
                onChange={() => set({ personalityTypes: toggle(filters.personalityTypes, type) })}
              />
            ))}
            <CheckRow
              label={UNTYPED}
              muted
              count={typeCount(UNTYPED)}
              checked={filters.personalityTypes.includes(UNTYPED)}
              onChange={() => set({ personalityTypes: toggle(filters.personalityTypes, UNTYPED) })}
            />
          </div>
        )}
      </section>

      <section className="px-4 py-3">
        <h3 className="label mb-2">Review status</h3>
        {reviewStatuses.length === 0 ? (
          <p className="text-sm text-slate-500">No review statuses recorded in the loaded rows.</p>
        ) : (
          reviewStatuses.map((status) => (
            <CheckRow
              key={status}
              label={status}
              count={leads.filter((l) => l.review_status?.trim() === status).length}
              checked={filters.reviewStatuses.includes(status)}
              onChange={() => set({ reviewStatuses: toggle(filters.reviewStatuses, status) })}
            />
          ))
        )}
      </section>

      <section className="px-4 py-3">
        <h3 className="label mb-2">Email</h3>
        <div className="space-y-1">
          {(
            [
              ['any', 'Any'],
              ['yes', 'Has an email address'],
              ['no', 'No email address'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-50">
              <input
                type="radio"
                name="has-email"
                checked={filters.hasEmail === value}
                onChange={() => set({ hasEmail: value })}
                className="h-3.5 w-3.5 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">{label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
