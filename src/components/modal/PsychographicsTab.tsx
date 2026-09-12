import {
  detailedResponse,
  groupTraits,
  isEmptyTraitValue,
  metaTraits,
} from '../../lib/traitsRegistry';
import type { Lead } from '../../lib/types';
import { Markdown } from '../Markdown';
import { TraitRow } from '../TraitValue';

export function PsychographicsTab({ lead }: { lead: Lead }) {
  const groups = groupTraits(lead.traits);
  const meta = metaTraits(lead.traits);
  const detail = detailedResponse(lead.traits);
  const hasTraits = !!lead.traits && !isEmptyTraitValue(lead.traits);

  if (!hasTraits) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm font-medium text-slate-800">This lead has not been profiled yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          The traits column is empty, which means the AI profiling step has not run for this row —
          or ran and returned nothing. Profiling happens in the database pipeline, not in this
          dashboard.
        </p>
      </div>
    );
  }

  if (groups.length === 0 && !detail) {
    return (
      <p className="text-sm text-slate-600">
        This lead has traits recorded, but every value belongs on another tab. Check Profile and
        Outreach.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {/* The profiling write-up leads, because it is the reading of this lead
          that the rest of the tab then breaks into fields. */}
      {detail ? (
        <section>
          <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-900">
            Detailed response
          </h3>
          <Markdown text={detail} />
        </section>
      ) : null}

      {groups.map((block) => (
        <section key={block.group}>
          <h3 className="mb-4 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-900">
            {block.label}
            {block.group === 'other' ? (
              <span className="ml-2 text-xs font-normal text-slate-500">
                Keys this dashboard has no display rule for yet
              </span>
            ) : null}
          </h3>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
            {block.traits.map((trait) => (
              <div
                key={trait.key}
                // Long text and gauges take the full row; short values pair up.
                className={
                  trait.type === 'long' || trait.type === 'message' || trait.type === 'array'
                    ? 'md:col-span-2'
                    : undefined
                }
              >
                <TraitRow trait={trait} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {meta.length > 0 ? (
        <section className="border-t border-slate-200 pt-4">
          <h3 className="label mb-2">Profiling metadata</h3>
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            {meta.map((trait) => (
              <div key={trait.key} className="flex items-baseline gap-2">
                <dt className="text-xs text-slate-500">{trait.label}:</dt>
                <dd className="text-xs text-slate-700">
                  {typeof trait.value === 'boolean'
                    ? trait.value
                      ? 'Yes'
                      : 'No'
                    : String(trait.value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
