import {
  normaliseFacet,
  toChipArray,
  type ResolvedTrait,
} from '../lib/traitsRegistry';
import { Chip, FacetBar, FitGauge } from './ui';

/**
 * Renders one resolved trait according to its registry render type.
 * Long values are never truncated here — the modal is where full text lives.
 */
export function TraitValue({ trait }: { trait: ResolvedTrait }) {
  const { type, value } = trait;

  switch (type) {
    case 'score': {
      const n = Number(value);
      if (!Number.isFinite(n)) return <PlainValue value={value} />;
      return (
        <div className="max-w-sm">
          <FitGauge score={n} />
        </div>
      );
    }

    case 'bar': {
      const n = Number(value);
      if (!Number.isFinite(n)) return <PlainValue value={value} />;
      return (
        <div className="max-w-sm">
          <FacetBar label={trait.label} pct={normaliseFacet(n)} raw={String(value)} />
        </div>
      );
    }

    case 'array': {
      const chips = toChipArray(value);
      if (chips.length === 0) return null;
      return (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <Chip key={`${chip}-${i}`} tone={trait.tone}>
              {chip}
            </Chip>
          ))}
        </div>
      );
    }

    case 'bool': {
      const truthy =
        typeof value === 'boolean' ? value : ['true', 'yes', '1'].includes(String(value).toLowerCase());
      return (
        <span className={`pill ${truthy ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          {truthy ? 'Yes' : 'No'}
        </span>
      );
    }

    case 'long':
    case 'message':
      return (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
          {stringify(value)}
        </p>
      );

    case 'short':
    default:
      return <PlainValue value={value} />;
  }
}

function PlainValue({ value }: { value: unknown }) {
  return <p className="break-words text-sm text-slate-800">{stringify(value)}</p>;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Label + value. The `bar` type draws its own label inside the bar component,
 * so it is not repeated here.
 */
export function TraitRow({ trait }: { trait: ResolvedTrait }) {
  if (trait.type === 'bar') {
    return <TraitValue trait={trait} />;
  }
  return (
    <div>
      <p className="label">{trait.label}</p>
      {trait.hint ? <p className="mb-1 mt-0.5 text-xs text-slate-500">{trait.hint}</p> : null}
      <div className="mt-1">
        <TraitValue trait={trait} />
      </div>
    </div>
  );
}
