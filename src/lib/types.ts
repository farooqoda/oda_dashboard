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
  Pick<Lead, 'stage' | 'connection_status' | 'review_status'>
>;
