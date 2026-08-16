import type { SupabaseClient } from '@supabase/supabase-js';
import { toFriendlyError, type FriendlyError } from './supabase';

/**
 * AUTH AND INVITE REDEMPTION
 * ==========================
 * Tenant isolation is enforced by Row Level Security against `auth.uid()`.
 * Once a user is signed in, every existing query against gab_leads and
 * gab_activity is scoped by the database — this app holds no client filter of
 * its own, and must not add one.
 *
 * Two tables are involved in linking a new user to a client:
 *
 *   gab_client_invites  an invite code and the client_id it grants
 *   gab_user_clients    the join row: which auth user belongs to which client
 *
 * Their exact column names were not part of the original data model, so the
 * shapes below are DETECTED at runtime rather than assumed — see
 * `readInviteState`. The names this file depends on are collected here so
 * there is one place to correct if they differ.
 */
export const AUTH_TABLES = {
  invites: 'gab_client_invites',
  userClients: 'gab_user_clients',
} as const;

export const AUTH_COLUMNS = {
  /** On gab_client_invites: the code the user types. */
  inviteCode: 'code',
  /** On both tables: the tenant the invite grants / the user belongs to. */
  clientId: 'client_id',
  /** On gab_user_clients: the auth user's uuid. */
  userId: 'user_id',
} as const;

// ---------------------------------------------------------------------------
// Auth error messages
// ---------------------------------------------------------------------------

/**
 * Supabase auth messages are terse and occasionally cryptic. These map the
 * common ones to something a user can act on, while keeping the original text
 * available so a genuine bug is never hidden behind a friendly sentence.
 */
export function toAuthError(error: unknown): FriendlyError {
  const base = toFriendlyError(error);
  const raw = base.message;

  const friendly = (message: string, hint: string | null = null): FriendlyError => ({
    message,
    hint: hint ?? (raw && raw !== message ? `Supabase said: ${raw}` : null),
    code: base.code,
  });

  if (/invalid login credentials/i.test(raw)) {
    return friendly('That email and password combination was not recognised.');
  }
  if (/email not confirmed/i.test(raw)) {
    return friendly(
      'This email address has not been confirmed yet.',
      'Open the confirmation link Supabase emailed you, then sign in again.',
    );
  }
  if (/user already registered|already been registered/i.test(raw)) {
    return friendly(
      'An account already exists for this email address.',
      'Sign in instead, or use a different email address.',
    );
  }
  if (/password should be at least|password.*too short/i.test(raw)) {
    return friendly('That password is too short for this project’s policy.', `Supabase said: ${raw}`);
  }
  if (/rate limit|too many requests/i.test(raw)) {
    return friendly('Too many attempts. Wait a minute and try again.');
  }
  if (/signups not allowed|signup is disabled/i.test(raw)) {
    return friendly(
      'Sign up is disabled for this Supabase project.',
      'Enable email signups in Authentication → Providers, or ask an administrator to create the account.',
    );
  }
  return base;
}

// ---------------------------------------------------------------------------
// Invite state detection
// ---------------------------------------------------------------------------

type UsedShape =
  | { kind: 'boolean'; column: string }
  | { kind: 'timestamp'; column: string }
  | { kind: 'none' };

/**
 * Works out, from a row that was actually returned, how this deployment
 * records that an invite has been spent. Supports a boolean (`used`,
 * `is_used`, `redeemed`) or a nullable timestamp (`used_at`, `redeemed_at`,
 * `claimed_at`), because both conventions are common and the schema for this
 * table was never specified.
 */
function detectUsedShape(row: Record<string, unknown>): UsedShape {
  for (const column of ['used', 'is_used', 'redeemed', 'is_redeemed']) {
    if (column in row && (typeof row[column] === 'boolean' || row[column] === null)) {
      return { kind: 'boolean', column };
    }
  }
  for (const column of ['used_at', 'redeemed_at', 'claimed_at', 'used_on']) {
    if (column in row) return { kind: 'timestamp', column };
  }
  return { kind: 'none' };
}

function isSpent(row: Record<string, unknown>, shape: UsedShape): boolean {
  if (shape.kind === 'boolean') return row[shape.column] === true;
  if (shape.kind === 'timestamp') return row[shape.column] !== null && row[shape.column] !== undefined;
  return false;
}

/** The patch that marks an invite spent, shaped to whatever columns exist. */
function spendPatch(row: Record<string, unknown>, shape: UsedShape, userId: string) {
  const patch: Record<string, unknown> = {};
  if (shape.kind === 'boolean') patch[shape.column] = true;
  if (shape.kind === 'timestamp') patch[shape.column] = new Date().toISOString();
  // Only set provenance columns that this table actually has.
  if ('used_by' in row) patch.used_by = userId;
  else if ('redeemed_by' in row) patch.redeemed_by = userId;
  if (shape.kind === 'boolean' && 'used_at' in row) patch.used_at = new Date().toISOString();
  return patch;
}

export const INVITE_NOT_FOUND = 'INVITE_NOT_FOUND';
export const INVITE_ALREADY_USED = 'INVITE_ALREADY_USED';

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

export interface RedeemResult {
  clientId: string | null;
  error: FriendlyError | null;
}

/**
 * Links a signed-in user to the client an invite code grants.
 *
 * Ordering matters. The invite is validated first so the user gets a precise
 * error ("not recognised" vs "already used"), but it is CLAIMED with a single
 * conditional UPDATE that only matches while the invite is still unspent.
 * A plain read-then-write would let two people redeem the same code at once;
 * the conditional update collapses that into one atomic step, and if it
 * matches nothing the link row inserted a moment earlier is removed again.
 *
 * NOTE: this runs in the browser under the user's own JWT, which puts a hard
 * ceiling on how much it can guarantee — see the security note in the README.
 * Moving redemption into a SECURITY DEFINER function is the durable fix.
 */
export async function redeemInvite(
  client: SupabaseClient,
  rawCode: string,
  userId: string,
): Promise<RedeemResult> {
  const code = rawCode.trim();
  if (!code) {
    return {
      clientId: null,
      error: { message: 'Enter the invite code you were given.', hint: null, code: INVITE_NOT_FOUND },
    };
  }

  // 1. Validate, and read the row so its actual columns can be inspected.
  const { data: rows, error: lookupError } = await client
    .from(AUTH_TABLES.invites)
    .select('*')
    .eq(AUTH_COLUMNS.inviteCode, code)
    .limit(1);

  if (lookupError) return { clientId: null, error: toFriendlyError(lookupError) };

  const invite = (rows ?? [])[0] as Record<string, unknown> | undefined;
  if (!invite) {
    return {
      clientId: null,
      error: {
        message: 'That invite code was not recognised.',
        hint: 'Check for typos, including capitalisation — codes are matched exactly.',
        code: INVITE_NOT_FOUND,
      },
    };
  }

  const shape = detectUsedShape(invite);
  if (isSpent(invite, shape)) {
    return {
      clientId: null,
      error: {
        message: 'That invite code has already been used.',
        hint: 'Each code links one account to one client. Ask for a fresh code.',
        code: INVITE_ALREADY_USED,
      },
    };
  }

  const clientId = invite[AUTH_COLUMNS.clientId];
  if (typeof clientId !== 'string' || !clientId.trim()) {
    return {
      clientId: null,
      error: {
        message: 'That invite code is not attached to a client.',
        hint: `The row in ${AUTH_TABLES.invites} has no ${AUTH_COLUMNS.clientId}. An administrator needs to fix the invite.`,
        code: 'INVITE_NO_CLIENT',
      },
    };
  }

  // 2. Link the user to the client.
  const { error: linkError } = await client.from(AUTH_TABLES.userClients).insert({
    [AUTH_COLUMNS.userId]: userId,
    [AUTH_COLUMNS.clientId]: clientId,
  });

  // 23505 = unique violation: the user is already linked, which is fine.
  const alreadyLinked = (linkError as { code?: string } | null)?.code === '23505';
  if (linkError && !alreadyLinked) {
    return { clientId: null, error: toFriendlyError(linkError) };
  }

  // 3. Claim the invite atomically. Only matches while it is still unspent.
  if (shape.kind !== 'none') {
    let claim = client
      .from(AUTH_TABLES.invites)
      .update(spendPatch(invite, shape, userId))
      .eq(AUTH_COLUMNS.inviteCode, code);

    claim =
      shape.kind === 'boolean'
        ? claim.or(`${shape.column}.is.null,${shape.column}.eq.false`)
        : claim.is(shape.column, null);

    const { data: claimed, error: claimError } = await claim.select(AUTH_COLUMNS.inviteCode);

    if (claimError) {
      if (!alreadyLinked) await unlink(client, userId, clientId);
      return { clientId: null, error: toFriendlyError(claimError) };
    }

    if (!claimed || claimed.length === 0) {
      // Someone redeemed it between the read and the update.
      if (!alreadyLinked) await unlink(client, userId, clientId);
      return {
        clientId: null,
        error: {
          message: 'That invite code has already been used.',
          hint: 'It was claimed by another account moments ago. Ask for a fresh code.',
          code: INVITE_ALREADY_USED,
        },
      };
    }
  }

  return { clientId, error: null };
}

/** Best-effort rollback of the link row when the claim loses the race. */
async function unlink(client: SupabaseClient, userId: string, clientId: string): Promise<void> {
  await client
    .from(AUTH_TABLES.userClients)
    .delete()
    .eq(AUTH_COLUMNS.userId, userId)
    .eq(AUTH_COLUMNS.clientId, clientId);
}

/**
 * The client_id for the signed-in user, read from their own row.
 * Returns `undefined` for "no row" — a distinct state from "query failed",
 * because the two need different screens.
 */
export async function fetchClientId(
  client: SupabaseClient,
  userId: string,
): Promise<{ clientId: string | undefined; error: FriendlyError | null }> {
  const { data, error } = await client
    .from(AUTH_TABLES.userClients)
    .select(AUTH_COLUMNS.clientId)
    .eq(AUTH_COLUMNS.userId, userId)
    .limit(1);

  if (error) return { clientId: undefined, error: toFriendlyError(error) };

  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  const clientId = row?.[AUTH_COLUMNS.clientId];
  return {
    clientId: typeof clientId === 'string' && clientId.trim() ? clientId : undefined,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Pending invite handoff
// ---------------------------------------------------------------------------

const PENDING_KEY = 'oda.pendingInviteCode';

/**
 * When a project has email confirmation switched on, `signUp` returns a user
 * but NO session — so the invite cannot be redeemed yet, because redemption
 * writes as the user. The code is parked here and redeemed on first sign-in.
 */
export function storePendingInvite(code: string): void {
  try {
    window.localStorage.setItem(PENDING_KEY, code);
  } catch {
    /* storage unavailable — the user can enter the code again after signing in */
  }
}

export function takePendingInvite(): string | null {
  try {
    const code = window.localStorage.getItem(PENDING_KEY);
    if (code) window.localStorage.removeItem(PENDING_KEY);
    return code;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to do */
  }
}
