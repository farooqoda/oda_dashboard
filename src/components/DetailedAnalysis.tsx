import { detailedResponse, priority, recommendedNextStep, relationshipScore, type RelationshipScore } from '../lib/traitsRegistry';
import type { TraitsRecord } from '../lib/types';
import { Markdown } from './Markdown';

/**
 * THE ENRICHED ANALYSIS
 * =====================
 * `priority`, `recommended_next_step` and `detailed_response` are one output
 * of one prompt, so they are drawn together here and shared by the two tabs
 * that show them — the top of Psychographics, and the "Details" disclosure
 * under the invite on Outreach — rather than each tab assembling its own.
 *
 * All three are optional. Any subset renders; none of them renders nothing.
 */

/** Urgency, as a badge. Unknown words keep their text in a neutral badge. */
function PriorityBadge({ value }: { value: string }) {
  const known: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    urgent: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    moderate: 'bg-yellow-100 text-yellow-700',
    low: 'bg-gray-100 text-gray-700',
  };
  const tone = known[value.trim().toLowerCase()] ?? 'bg-slate-100 text-slate-700';

  return (
    <div className="flex items-center gap-2">
      <span className="label">Priority</span>
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
        {value}
      </span>
    </div>
  );
}

/** ver35: the relationship score, worked out by the profiler (0–3 per factor, out of 15). */
function RelationshipCard({ score }: { score: RelationshipScore }) {
  const tone =
    score.total >= 12 ? 'bg-emerald-100 text-emerald-800' : score.total >= 8 ? 'bg-sky-100 text-sky-800' : score.total >= 4 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-700';
  return (
    <div className="rounded-md border border-brand-200 bg-brand-50 p-3" data-testid="relationship-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-brand-700">Relationship score</span>
        <span className="text-lg font-bold tabular-nums text-ink">{score.total} / 15</span>
        {score.interpretation ? (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{score.interpretation}</span>
        ) : null}
      </div>
      {score.factors.length ? (
        <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {score.factors.map((f) => (
            <li key={f.label} className="flex items-center justify-between gap-3 text-xs text-slate-700">
              <span>{f.label}</span>
              <span className="flex items-center gap-1" aria-label={`${f.value} of 3`}>
                {[1, 2, 3].map((i) => (
                  <span key={i} className={`h-2 w-4 rounded-sm ${i <= f.value ? 'bg-brand-500' : 'bg-slate-200'}`} />
                ))}
                <span className="ml-1 tabular-nums">{f.value}/3</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function DetailedAnalysis({ traits }: { traits: TraitsRecord | null | undefined }) {
  const detail = detailedResponse(traits);
  const urgency = priority(traits);
  const nextStep = recommendedNextStep(traits);
  const rel = relationshipScore(traits);

  if (!detail && !urgency && !nextStep && !rel) return null;

  return (
    <div className="space-y-4">
      {urgency ? <PriorityBadge value={urgency} /> : null}

      {rel ? <RelationshipCard score={rel} /> : null}

      {nextStep ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Recommended next step</p>
          <p className="mt-1 leading-relaxed text-slate-700">{nextStep}</p>
        </div>
      ) : null}

      {detail ? <Markdown text={detail} structure /> : null}
    </div>
  );
}

/** Whether a row carries any of it — so a tab can decide to show a heading. */
export function hasDetailedAnalysis(traits: TraitsRecord | null | undefined): boolean {
  return !!detailedResponse(traits) || !!priority(traits) || !!recommendedNextStep(traits);
}
