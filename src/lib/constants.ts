/**
 * Hardcoded vocabularies.
 *
 * These lists are deliberately NOT derived from the rows that happen to be
 * loaded. A bucket with no leads still has to appear in the filter list (with a
 * count of 0) — deriving the list from data was the flaw in the previous
 * dashboard, where empty buckets silently vanished.
 */

export const ODA_BUCKETS = [
  'Student or family beneficiary',
  'Newcomer support organization',
  'School or youth organization',
  'Settlement or community partner',
  'Corporate sponsor',
  'Foundation or funder',
  'Volunteer or mentor',
  'Referral connector',
  'Technology or service partner',
  'Not currently relevant',
] as const;

export type OdaBucket = (typeof ODA_BUCKETS)[number];

export const PIPELINE_STAGES = [
  'New Lead',
  'Contacted',
  'Replied',
  'Interested',
  'Meeting Scheduled',
  'Won',
  'Lost',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const DEFAULT_STAGE: PipelineStage = 'New Lead';

/**
 * Write-back option lists. The database has no enum constraint on these, so
 * these are the values this UI offers; anything already in a row is preserved
 * and shown even if it is not in the list.
 */
export const CONNECTION_STATUSES = [
  'Not connected',
  'Invite sent',
  'Connected',
  'Withdrawn',
  'Declined',
] as const;

export const REVIEW_STATUSES = [
  'Needs human review',
  'Approved',
  'Rejected',
  'On hold',
] as const;

/** LinkedIn caps connection-invite notes at 300 characters. */
export const INVITE_CHAR_LIMIT = 300;

export const PAGE_SIZE = 50;

/** Supabase REST is asked for at most this many rows; paging happens client-side. */
export const MAX_ROWS = 1000;

export const FIT_HIGH = 70;
export const FIT_MID = 40;

/**
 * Shown on Settings and wherever the user needs a human. Change this to the
 * address your team actually monitors.
 */
export const SUPPORT_EMAIL = 'support@ontariodigitalacademy.org';
