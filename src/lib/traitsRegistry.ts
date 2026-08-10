/**
 * THE TRAITS REGISTRY
 * ===================
 * `gab_leads.traits` is a free-form jsonb blob written by whichever AI
 * profiling framework the client is configured with. Key names therefore vary
 * from row to row, and new frameworks get switched on in the database without
 * anyone touching this app.
 *
 * The rule this file enforces:
 *
 *   - A key listed below renders with a human label, in a known group, using a
 *     known render type.
 *   - A key NOT listed still renders. It lands in the "Other" group with its
 *     raw key prettified into a label and its render type inferred from the
 *     value's shape.
 *   - A key whose value is empty (null, undefined, "", [], {}) renders NOWHERE.
 *     No empty labels, no "undefined".
 *
 * To support a new framework, add its keys to TRAIT_DEFINITIONS. That is the
 * whole job — every screen reads from here. Adding nothing at all is also a
 * valid outcome: the keys will show up under "Other".
 */

import type { TraitsRecord } from './types';

/** How a value is drawn. */
export type TraitRenderType =
  | 'short' // one line of text
  | 'long' // a paragraph, rendered in full, never truncated
  | 'score' // 0-100, drawn as a gauge
  | 'bar' // 0-100, drawn as a small inline bar (Big Five facets)
  | 'array' // list of chips
  | 'bool' // yes / no
  | 'message'; // a generated message block, shown with copy + char count

/**
 * Where a trait is drawn. Several traits belong on the Profile or Outreach tab
 * rather than in the Psychographics groups, so the registry — not the tab —
 * decides placement.
 */
export type TraitSurface = 'psychographics' | 'profile' | 'outreach' | 'meta';

/** Psychographics groups, in render order. */
export const TRAIT_GROUPS = [
  'personality',
  'motivation',
  'approach',
  'assessment',
  'other',
] as const;

export type TraitGroup = (typeof TRAIT_GROUPS)[number];

export const TRAIT_GROUP_LABELS: Record<TraitGroup, string> = {
  personality: 'Personality',
  motivation: 'Motivation',
  approach: 'Approach',
  assessment: 'Assessment',
  other: 'Other',
};

export interface TraitDefinition {
  label: string;
  type: TraitRenderType;
  /** Only meaningful when surface === 'psychographics'. */
  group: TraitGroup;
  surface: TraitSurface;
  /** Sort order within a group. Lower first; unset sorts last. */
  order?: number;
  /** Array chips rendered in red — used for risk_flags. */
  tone?: 'neutral' | 'danger';
  /** Shown under the label in smaller text. */
  hint?: string;
}

export const TRAIT_DEFINITIONS: Record<string, TraitDefinition> = {
  // ---- Common across most frameworks --------------------------------------
  disc_type: {
    label: 'Personality type',
    type: 'short',
    group: 'personality',
    surface: 'psychographics',
    order: 1,
  },
  disc_description: {
    label: 'Type description',
    type: 'long',
    group: 'personality',
    surface: 'psychographics',
    order: 2,
  },
  core_motivator: {
    label: 'Core motivator',
    type: 'long',
    group: 'motivation',
    surface: 'psychographics',
    order: 1,
  },
  core_fear: {
    label: 'Core fear',
    type: 'long',
    group: 'motivation',
    surface: 'psychographics',
    order: 2,
  },
  communication_style: {
    label: 'Communication style',
    type: 'long',
    group: 'approach',
    surface: 'psychographics',
    order: 1,
  },
  presentation_tone: {
    label: 'Presentation tone',
    type: 'long',
    group: 'approach',
    surface: 'psychographics',
    order: 2,
  },
  advisory_board_hook: {
    label: 'Advisory board hook',
    type: 'long',
    group: 'approach',
    surface: 'psychographics',
    order: 3,
  },
  likely_objection: {
    label: 'Likely objection',
    type: 'long',
    group: 'approach',
    surface: 'psychographics',
    order: 4,
  },
  university: {
    label: 'University',
    type: 'short',
    group: 'assessment',
    surface: 'profile',
  },
  department_subject: {
    label: 'Department or subject',
    type: 'short',
    group: 'assessment',
    surface: 'profile',
  },
  parse_ok: {
    label: 'Profile parsed cleanly',
    type: 'bool',
    group: 'other',
    surface: 'meta',
  },

  // ---- ODA framework -------------------------------------------------------
  oda_bucket: {
    label: 'Bucket',
    type: 'short',
    group: 'assessment',
    surface: 'psychographics',
    order: 1,
  },
  fit_score: {
    label: 'Fit score',
    type: 'score',
    group: 'assessment',
    surface: 'psychographics',
    order: 2,
  },
  priority: {
    label: 'Priority',
    type: 'short',
    group: 'assessment',
    surface: 'psychographics',
    order: 3,
  },
  recommended_next_step: {
    label: 'Recommended next step',
    type: 'long',
    group: 'assessment',
    surface: 'psychographics',
    order: 4,
  },
  conversation_summary: {
    label: 'Conversation summary',
    type: 'long',
    group: 'assessment',
    surface: 'psychographics',
    order: 5,
  },
  missing_information: {
    label: 'Missing information',
    type: 'array',
    group: 'assessment',
    surface: 'psychographics',
    order: 6,
    hint: 'Fields the profiling step could not fill from the scraped profile.',
  },
  risk_flags: {
    label: 'Risk flags',
    type: 'array',
    group: 'assessment',
    surface: 'psychographics',
    order: 7,
    tone: 'danger',
  },
  response_needed: {
    label: 'Response needed',
    type: 'bool',
    group: 'assessment',
    surface: 'outreach',
  },
  response_reason: {
    label: 'Response reasoning',
    type: 'long',
    group: 'assessment',
    surface: 'outreach',
  },
  linkedin_job_title: {
    label: 'Job title (LinkedIn)',
    type: 'short',
    group: 'assessment',
    surface: 'profile',
  },
  linkedin_experience: {
    label: 'Experience (LinkedIn)',
    type: 'long',
    group: 'assessment',
    surface: 'profile',
  },
  linkedin_inmail_subject: {
    label: 'InMail subject',
    type: 'short',
    group: 'assessment',
    surface: 'outreach',
  },
  linkedin_inmail_message: {
    label: 'InMail message',
    type: 'message',
    group: 'assessment',
    surface: 'outreach',
  },
  prompt_version: {
    label: 'Prompt version',
    type: 'short',
    group: 'other',
    surface: 'meta',
  },
  review_status: {
    // The gab_leads.review_status COLUMN is what the app reads and writes.
    // This key is whatever the profiling run recorded at the time, kept as
    // metadata so the two can be compared.
    label: 'Review status recorded by profiling',
    type: 'short',
    group: 'other',
    surface: 'meta',
  },

  // ---- Big Five framework --------------------------------------------------
  openness: {
    label: 'Openness',
    type: 'bar',
    group: 'personality',
    surface: 'psychographics',
    order: 10,
  },
  conscientiousness: {
    label: 'Conscientiousness',
    type: 'bar',
    group: 'personality',
    surface: 'psychographics',
    order: 11,
  },
  extraversion: {
    label: 'Extraversion',
    type: 'bar',
    group: 'personality',
    surface: 'psychographics',
    order: 12,
  },
  agreeableness: {
    label: 'Agreeableness',
    type: 'bar',
    group: 'personality',
    surface: 'psychographics',
    order: 13,
  },
  neuroticism: {
    label: 'Neuroticism',
    type: 'bar',
    group: 'personality',
    surface: 'psychographics',
    order: 14,
  },

  // ---- Strengths framework -------------------------------------------------
  dominant_domain: {
    label: 'Dominant domain',
    type: 'short',
    group: 'personality',
    surface: 'psychographics',
    order: 20,
  },
  top_strengths: {
    label: 'Top strengths',
    type: 'array',
    group: 'personality',
    surface: 'psychographics',
    order: 21,
  },

  // ---- Core Motivation framework -------------------------------------------
  primary_motivator: {
    label: 'Primary motivator',
    type: 'short',
    group: 'motivation',
    surface: 'psychographics',
    order: 3,
  },
  secondary_motivator: {
    label: 'Secondary motivator',
    type: 'short',
    group: 'motivation',
    surface: 'psychographics',
    order: 4,
  },
};

/** A trait key with a value, resolved against the registry and ready to draw. */
export interface ResolvedTrait {
  key: string;
  label: string;
  type: TraitRenderType;
  group: TraitGroup;
  surface: TraitSurface;
  order: number;
  tone: 'neutral' | 'danger';
  hint?: string;
  value: unknown;
  /** True when the key was not in the registry. */
  unregistered: boolean;
}

/** Empty means "do not render at all". */
export function isEmptyTraitValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) {
    return value.filter((v) => !isEmptyTraitValue(v)).length === 0;
  }
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  return false;
}

/** `linkedin_inmail_subject` -> `Linkedin inmail subject`. */
export function prettifyKey(key: string): string {
  const words = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Best-effort render type for a key the registry has never seen. */
function inferRenderType(value: unknown): TraitRenderType {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return 'short';
  if (typeof value === 'string') return value.length > 120 ? 'long' : 'short';
  return 'long';
}

/**
 * Resolve every non-empty key in a traits blob. Unknown keys are kept, which
 * is the point of the registry — a framework nobody has told the dashboard
 * about still renders something useful.
 */
export function resolveTraits(traits: TraitsRecord | null | undefined): ResolvedTrait[] {
  if (!traits || typeof traits !== 'object') return [];

  return Object.entries(traits)
    .filter(([, value]) => !isEmptyTraitValue(value))
    .map(([key, value]) => {
      const def = TRAIT_DEFINITIONS[key];
      if (def) {
        return {
          key,
          label: def.label,
          type: def.type,
          group: def.group,
          surface: def.surface,
          order: def.order ?? 500,
          tone: def.tone ?? 'neutral',
          hint: def.hint,
          value,
          unregistered: false,
        } satisfies ResolvedTrait;
      }
      return {
        key,
        label: prettifyKey(key),
        type: inferRenderType(value),
        group: 'other' as TraitGroup,
        surface: 'psychographics' as TraitSurface,
        order: 900,
        tone: 'neutral' as const,
        value,
        unregistered: true,
      } satisfies ResolvedTrait;
    });
}

export interface TraitGroupBlock {
  group: TraitGroup;
  label: string;
  traits: ResolvedTrait[];
}

/** Resolved traits for the Psychographics tab, bucketed and ordered. */
export function groupTraits(traits: TraitsRecord | null | undefined): TraitGroupBlock[] {
  const resolved = resolveTraits(traits).filter((t) => t.surface === 'psychographics');

  return TRAIT_GROUPS.map((group) => ({
    group,
    label: TRAIT_GROUP_LABELS[group],
    traits: resolved
      .filter((t) => t.group === group)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
  })).filter((block) => block.traits.length > 0);
}

/** Resolved traits whose registry surface is `meta` (profiling provenance). */
export function metaTraits(traits: TraitsRecord | null | undefined): ResolvedTrait[] {
  return resolveTraits(traits)
    .filter((t) => t.surface === 'meta')
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// Typed accessors. Everything that reads a specific trait key goes through
// these, so the key names live in exactly one file.
// ---------------------------------------------------------------------------

export function traitString(
  traits: TraitsRecord | null | undefined,
  key: string,
): string | null {
  if (!traits) return null;
  const value = traits[key];
  if (isEmptyTraitValue(value)) return null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function traitNumber(
  traits: TraitsRecord | null | undefined,
  key: string,
): number | null {
  if (!traits) return null;
  const value = traits[key];
  if (isEmptyTraitValue(value)) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

export function traitBool(
  traits: TraitsRecord | null | undefined,
  key: string,
): boolean | null {
  if (!traits) return null;
  const value = traits[key];
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'no', 'n', '0'].includes(s)) return false;
  return null;
}

/** Coerce a value into chips. Frameworks send arrays; some send one string. */
export function toChipArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((v) => !isEmptyTraitValue(v))
      .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  return [];
}

/**
 * Normalise a Big Five style facet to 0-100.
 * Frameworks have shipped these as 0-1, 0-5, 0-10 and 0-100. The scale is
 * guessed from the magnitude; the raw value is always displayed alongside the
 * bar so a wrong guess is visible rather than silent.
 */
export function normaliseFacet(value: number): number {
  let pct: number;
  if (value <= 1) pct = value * 100;
  else if (value <= 5) pct = (value / 5) * 100;
  else if (value <= 10) pct = (value / 10) * 100;
  else pct = value;
  return Math.max(0, Math.min(100, pct));
}

/** The personality type used for pills and filtering. */
export function personalityType(traits: TraitsRecord | null | undefined): string | null {
  return traitString(traits, 'disc_type');
}

export function odaBucket(traits: TraitsRecord | null | undefined): string | null {
  return traitString(traits, 'oda_bucket');
}

export function fitScore(traits: TraitsRecord | null | undefined): number | null {
  return traitNumber(traits, 'fit_score');
}

/** Every trait value flattened into one lowercase haystack, for search. */
export function traitsSearchText(traits: TraitsRecord | null | undefined): string {
  if (!traits) return '';
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (isEmptyTraitValue(value)) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(walk);
    } else {
      parts.push(String(value));
    }
  };
  Object.values(traits).forEach(walk);
  return parts.join(' ').toLowerCase();
}
