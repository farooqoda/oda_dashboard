/**
 * Mirrors the two tables the anon key is allowed to read.
 * Nearly every column is nullable in practice — older rows predate several of
 * the profiling fields — so everything except `id` is typed as nullable and the
 * UI is expected to cope.
 */

export type TraitsRecord = Record<string, unknown>;

export interface Lead {
  id: number;
  client_id: string | null;
  user_id: string | null;
  linkedin_url: string | null;
  full_name: string | null;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  traits: TraitsRecord | null;
  invite_message: string | null;
  /** The LinkedIn thread, pasted in by the user, that a reply is drafted from. */
  conversation_history: string | null;
  /** The last reply drafted for this lead, written back by the draft webhook. */
  reply_draft: string | null;
  stage: string | null;
  connection_status: string | null;
  review_status: string | null;
  contact_id: string | null;
  profile_text: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Activity {
  id: number;
  client_id: string | null;
  linkedin_url: string | null;
  event_type: string | null;
  detail: string | null;
  created_at: string | null;
}

/** The subset of columns this app is allowed to write back. */
export type LeadPatch = Partial<
  Pick<
    Lead,
    'stage' | 'connection_status' | 'review_status' | 'conversation_history' | 'reply_draft'
  >
>;

/** A LinkedIn feed post scraped by the extension's Post Scraper (gab_posts). */
export interface Post {
  id: string;
  client_id: string | null;
  user_id: string | null;
  post_url: string;
  author_name: string | null;
  author_linkedin_url: string | null;
  author_title: string | null;
  post_text: string | null;
  post_posted_at: string | null;
  scraped_at: string | null;
  ai_comment_draft: string | null;
  comment_status: CommentStatus | null;
  comment_posted_at: string | null;
}

/** Where a post is in the comment workflow (see gab_comments_schema.sql). */
export type CommentStatus =
  | 'pending'
  | 'draft_requested'
  | 'drafting'
  | 'drafted'
  | 'skipped'
  | 'queued'
  | 'posting'
  | 'posted'
  | 'failed';

/** A post as the Comments page sees it: the Post plus the comment workflow fields. */
export interface CommentPost extends Post {
  comment_owner: string | null;
  comment_force: boolean | null;
  comment_skip_reason: string | null;
  comment_language: string | null;
  comment_error: string | null;
  comment_generated_at: string | null;
  comment_queued_at: string | null;
  comment_attempts: number | null;
}

/** The signed-in user's own comment prompt (gab_comment_settings). */
export interface CommentSettings {
  user_id: string;
  comment_prompt: string | null;
  comment_language: string;
  daily_limit: number;
}
