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
 * Drafts a reply from a pasted LinkedIn conversation. It is given the lead id,
 * the caller's client id and the conversation text, and answers with
 * `{ reply_draft }`. Nothing else in this app talks to it.
 */
export const DRAFT_REPLY_WEBHOOK = 'https://n8n.fisolutionz.com/webhook/draft-reply';

/**
 * Shown on Settings and wherever the user needs a human. Change this to the
 * address your team actually monitors.
 */
export const SUPPORT_EMAIL = 'support@ontariodigitalacademy.org';

/**
 * Where a password-reset email sends the user back to. Supabase Auth only
 * honours a `redirectTo` that is present in this project's own allow-list
 * (Authentication → URL Configuration → Redirect URLs) — anything else is
 * silently dropped in favour of the project's default Site URL, with no
 * error, which is a confusing thing to debug from the app side. Keep this in
 * sync with that allow-list rather than deriving it from window.location: a
 * value that happened to work from wherever it was last tested but was never
 * added to the allow-list would fail silently everywhere else.
 */
export const RESET_PASSWORD_REDIRECT_URL = 'https://gab.fisolutionz.com/reset-password';

/** Both password-reset paths — the emailed link and Settings — enforce this. */
export const MIN_PASSWORD_LENGTH = 8;
