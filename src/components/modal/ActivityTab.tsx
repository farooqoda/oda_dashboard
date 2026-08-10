import { useActivity } from '../../hooks/useActivity';
import { formatDateTime } from '../../lib/format';
import type { Lead } from '../../lib/types';
import { ErrorState } from '../ui';

export function ActivityTab({ lead }: { lead: Lead }) {
  const { rows, loading, error } = useActivity(lead.linkedin_url, lead.client_id);

  if (!lead.linkedin_url) {
    return (
      <p className="text-sm text-slate-600">
        This lead has no LinkedIn URL, and activity is keyed by LinkedIn URL — so there is nothing
        to look up.
      </p>
    );
  }

  if (error) return <ErrorState error={error} />;

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="skeleton h-2.5 w-2.5 rounded-full" />
            <div className="flex-1">
              <div className="skeleton h-3 w-40" />
              <div className="skeleton mt-2 h-3 w-64" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm font-medium text-slate-800">No activity recorded yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Nothing has been written to gab_activity for this LinkedIn URL. Rows appear here as the
          pipeline records them.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative border-l border-slate-200 pl-6">
      {rows.map((row) => (
        <li key={row.id} className="relative pb-6 last:pb-0">
          <span
            aria-hidden="true"
            className="absolute -left-[1.8rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500"
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm font-medium text-slate-900">
              {row.event_type?.trim() || 'Event'}
            </p>
            <time className="text-xs tabular-nums text-slate-500">
              {formatDateTime(row.created_at) ?? 'No timestamp'}
            </time>
          </div>
          {row.detail?.trim() ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
              {row.detail}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
