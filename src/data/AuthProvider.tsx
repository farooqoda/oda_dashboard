import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  clearPendingInvite,
  fetchClientLink,
  redeemInvite,
  storePendingInvite,
  takePendingInvite,
  toAuthError,
} from '../lib/auth';
import { supabase, supabaseConfigError, type FriendlyError } from '../lib/supabase';

export type AuthStatus =
  /** Restoring a persisted session — nothing may render yet. */
  | 'loading'
  /** No session: only Login and Sign up are reachable. */
  | 'signed-out'
  /** Signed in, but not linked to any client yet. */
  | 'unlinked'
  /** Signed in and linked — the dashboard is allowed to render. */
  | 'ready';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  /** The tenant this user belongs to. Never used as a query filter — RLS does that. */
  clientId: string | null;
  /** Human-readable client name when the join row carries one. */
  clientName: string | null;
  /**
   * True from the moment an invite is redeemed until the user leaves the
   * "Setup complete" screen. Set on both signup paths — immediately when
   * signUp returns a session, and on first sign-in when a parked code is
   * redeemed — so the licence key is shown once either way.
   */
  setupCompleted: boolean;
  dismissSetup: () => void;
  /** A failure while reading gab_user_clients, as opposed to simply having no row. */
  linkError: FriendlyError | null;
  signIn: (email: string, password: string) => Promise<FriendlyError | null>;
  signUp: (
    email: string,
    password: string,
    inviteCode: string,
  ) => Promise<{ error: FriendlyError | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Redeem a code for the already-signed-in user (the unlinked-account screen). */
  linkWithInvite: (inviteCode: string) => Promise<FriendlyError | null>;
  refreshLink: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CONFIG_ERROR: FriendlyError = {
  message: supabaseConfigError ?? 'Supabase is not configured.',
  hint: null,
  code: 'CONFIG',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [linkError, setLinkError] = useState<FriendlyError | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [linkChecked, setLinkChecked] = useState(false);
  const mounted = useRef(true);
  /** The user the current view belongs to — see the auth listener below. */
  const knownUserId = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Restore any persisted session, then track every change (sign in, sign out,
  // token refresh, and the other-tab case).
  //
  // `autoRefreshToken` fires an auth event roughly once an hour, and again
  // whenever the tab regains focus. Those carry the SAME user with a fresh JWT
  // — treating them as a new sign-in re-ran the client lookup, which pushed
  // `status` back to 'loading', which unmounted everything behind the gate
  // (LeadsProvider included) and flashed the boot screen. So the identity of
  // the user, not the arrival of an event, is what invalidates the link.
  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setLinkChecked(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted.current) return;
      const restored = data.session ?? null;
      setSession(restored);
      if (restored?.user?.id) knownUserId.current = restored.user.id;
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted.current) return;
      const nextUserId = next?.user?.id ?? null;
      const sameUser = nextUserId !== null && nextUserId === knownUserId.current;

      setSession(next);
      setAuthReady(true);

      // A token refresh, a user-metadata update, or a duplicate SIGNED_IN for
      // the account already on screen: keep the view exactly as it is.
      if (sameUser) return;

      knownUserId.current = nextUserId;
      if (!nextUserId) {
        setClientId(null);
        setClientName(null);
        setSetupCompleted(false);
        setLinkError(null);
        setLinkChecked(true);
      } else {
        setLinkChecked(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  /**
   * Resolve the user's client. If they arrived from a signup that could not
   * complete (email confirmation on), a parked invite code is redeemed here on
   * their first authenticated load.
   */
  const resolveLink = useCallback(async () => {
    if (!supabase || !userId) {
      setLinkChecked(true);
      return;
    }

    const { clientId: found, clientName: foundName, error } = await fetchClientLink(supabase, userId);
    if (!mounted.current) return;

    if (error) {
      setLinkError(error);
      setClientId(null);
      setLinkChecked(true);
      return;
    }

    if (found) {
      clearPendingInvite();
      setClientId(found);
      setClientName(foundName ?? null);
      setLinkError(null);
      setLinkChecked(true);
      return;
    }

    const pending = takePendingInvite();
    if (pending) {
      const result = await redeemInvite(supabase, pending, userId);
      if (!mounted.current) return;
      if (result.clientId) {
        setClientId(result.clientId);
        setSetupCompleted(true);
        setLinkError(null);
        setLinkChecked(true);
        return;
      }
      // Surface why the parked code failed instead of silently dropping it.
      setLinkError(result.error);
    }

    setClientId(null);
    setLinkChecked(true);
  }, [userId]);

  useEffect(() => {
    if (!authReady) return;
    if (!userId) {
      setLinkChecked(true);
      return;
    }
    if (linkChecked) return;
    void resolveLink();
  }, [authReady, userId, linkChecked, resolveLink]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return CONFIG_ERROR;
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error ? toAuthError(error) : null;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, inviteCode: string) => {
      if (!supabase) return { error: CONFIG_ERROR, needsEmailConfirmation: false };

      const code = inviteCode.trim();
      if (!code) {
        return {
          error: { message: 'Enter the invite code you were given.', hint: null, code: 'INVITE_MISSING' },
          needsEmailConfirmation: false,
        };
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (error) return { error: toAuthError(error), needsEmailConfirmation: false };

      const newUser = data.user;
      if (!newUser) {
        return {
          error: {
            message: 'Sign up did not return a user account.',
            hint: 'Contact support if this keeps happening.',
            code: null,
          },
          needsEmailConfirmation: false,
        };
      }

      // With email confirmation on, signUp returns a user but no session — so
      // there is no JWT to write with yet. Park the code and redeem it on the
      // first real sign-in rather than failing the signup.
      if (!data.session) {
        storePendingInvite(code);
        return { error: null, needsEmailConfirmation: true };
      }

      const result = await redeemInvite(supabase, code, newUser.id);
      if (result.error) {
        // The account exists but is unlinked. Keep the code so the
        // unlinked-account screen can explain and let them retry.
        return { error: result.error, needsEmailConfirmation: false };
      }

      if (mounted.current) {
        setClientId(result.clientId);
        setSetupCompleted(true);
        setLinkError(null);
        setLinkChecked(true);
      }
      return { error: null, needsEmailConfirmation: false };
    },
    [],
  );

  const linkWithInvite = useCallback(
    async (inviteCode: string) => {
      if (!supabase) return CONFIG_ERROR;
      if (!userId) {
        return { message: 'You are not signed in.', hint: null, code: 'NO_SESSION' };
      }
      const result = await redeemInvite(supabase, inviteCode, userId);
      if (result.error) return result.error;
      if (mounted.current) {
        setClientId(result.clientId);
        // Same as the two signup paths: this is the moment the account becomes
        // usable, and it is the user's only chance to see their extension key.
        setSetupCompleted(true);
        setLinkError(null);
        setLinkChecked(true);
      }
      return null;
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    clearPendingInvite();
    if (supabase) await supabase.auth.signOut();
    knownUserId.current = null;
    if (!mounted.current) return;
    setSession(null);
    setClientId(null);
    setClientName(null);
    setSetupCompleted(false);
    setLinkError(null);
    setLinkChecked(true);
  }, []);

  const dismissSetup = useCallback(() => setSetupCompleted(false), []);

  const refreshLink = useCallback(async () => {
    setLinkChecked(false);
  }, []);

  /**
   * Order matters: a known `clientId` wins over an in-flight link check, so a
   * background re-check (`refreshLink`) never drops a working dashboard back to
   * the loading gate. 'loading' is only for the states where there genuinely is
   * nothing to show yet.
   */
  const status: AuthStatus = !authReady
    ? 'loading'
    : !session
      ? 'signed-out'
      : clientId
        ? 'ready'
        : !linkChecked
          ? 'loading'
          : 'unlinked';

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      clientId,
      clientName,
      setupCompleted,
      dismissSetup,
      linkError,
      signIn,
      signUp,
      signOut,
      linkWithInvite,
      refreshLink,
    }),
    [
      status,
      session,
      clientId,
      clientName,
      setupCompleted,
      dismissSetup,
      linkError,
      signIn,
      signUp,
      signOut,
      linkWithInvite,
      refreshLink,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
