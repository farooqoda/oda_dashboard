import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/** Batch C4: the platform admin sets up teams (managers + members) from the dashboard. */
type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };
const notConfigured = { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };

export interface TeamPerson {
  client_id: string;
  email: string;
  role: 'manager' | 'member' | 'manager (of another team)' | 'manager (not signed up yet)';
}
export interface TeamDomain {
  pattern: string;
  client_id: string;
}
export interface SetupLine {
  email: string;
  result: string;
}

function fail<T>(error: { message: string; code?: string } | null): Result<T> {
  const e = toFriendlyError(error as never);
  if (error && (error.code === 'PGRST202' || /gab_setup_team|gab_teams|gab_team_domains/.test(error.message))) {
    e.hint = 'Run 7 - batch_c4_teams_schema.sql in Supabase first.';
  }
  return { data: null, error: e };
}

export async function loadTeams(): Promise<Result<{ people: TeamPerson[]; domains: TeamDomain[]; clients: { client_id: string; members: number }[] }>> {
  if (!supabase) return { data: null, error: notConfigured };
  const [p, d, c] = await Promise.all([supabase.rpc('gab_teams'), supabase.rpc('gab_team_domains'), supabase.rpc('gab_report_clients')]);
  if (p.error) return fail(p.error);
  if (d.error) return fail(d.error);
  if (c.error) return fail(c.error);
  return { data: { people: (p.data as TeamPerson[]) ?? [], domains: (d.data as TeamDomain[]) ?? [], clients: (c.data as { client_id: string; members: number }[]) ?? [] }, error: null };
}

/** Create a team, or add people / a manager / a domain to one. Every argument but the team is optional. */
export async function setupTeam(args: { client: string; manager?: string; members?: string[]; domain?: string; move?: boolean }): Promise<Result<SetupLine[]>> {
  if (!supabase) return { data: null, error: notConfigured };
  const { data, error } = await supabase.rpc('gab_setup_team', {
    p_client: args.client,
    p_manager_email: args.manager || null,
    p_members: args.members ?? [],
    p_domain: args.domain || null,
    p_move_existing: !!args.move,
  });
  if (error) return fail(error);
  return { data: (data as SetupLine[]) ?? [], error: null };
}

export async function removeManager(email: string, client: string): Promise<FriendlyError | null> {
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('gab_remove_manager', { p_email: email, p_client: client });
  return error ? toFriendlyError(error) : null;
}

export async function removeDomain(pattern: string): Promise<FriendlyError | null> {
  if (!supabase) return notConfigured;
  const { error } = await supabase.rpc('gab_remove_team_domain', { p_pattern: pattern });
  return error ? toFriendlyError(error) : null;
}

/** "a@x.com, b@x.com\nc@x.com" -> valid emails, and the bits that are not emails. */
export function parseEmails(text: string): { ok: string[]; bad: string[] } {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ok: string[] = [];
  const bad: string[] = [];
  for (const p of parts) (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p) ? ok : bad).push(p);
  return { ok: [...new Set(ok)], bad };
}

export const TEAM_ID = /^[A-Za-z0-9_-]{2,40}$/;
