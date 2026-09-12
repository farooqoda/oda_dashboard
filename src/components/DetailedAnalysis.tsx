import { detailedResponse, priority, recommendedNextStep } from '../lib/traitsRegistry';
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

export function DetailedAnalysis({ traits }: { traits: TraitsRecord | null | undefined }) {
  const detail = detailedResponse(traits);
  const urgency = priority(traits);
  const nextStep = recommendedNextStep(traits);

  if (!detail && !urgency && !nextStep) return null;

  return (
    <div className="space-y-4">
      {urgency ? <PriorityBadge value={urgency} /> : null}

      {nextStep ? (
        <div>
          <p className="label">Recommended next step</p>
          <p className="mt-1 leading-relaxed text-slate-700">{nextStep}</p>
        </div>
      ) : null}

      {detail ? <Markdown text={detail} /> : null}
    </div>
  );
}

/** Whether a row carries any of it — so a tab can decide to show a heading. */
export function hasDetailedAnalysis(traits: TraitsRecord | null | undefined): boolean {
  return !!detailedResponse(traits) || !!priority(traits) || !!recommendedNextStep(traits);
}
