import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout, Field, FormError } from '../components/AuthLayout';
import { updatePassword, validateNewPassword } from '../lib/auth';
import { supabase, supabaseConfigError, type FriendlyError } from '../lib/supabase';

/**
 * Where the emailed reset link lands (RESET_PASSWORD_REDIRECT_URL in
 * constants.ts). It is a public, top-level route — outside <RequireAuth> in
 * App.tsx, deliberately — because it has to work independently of the normal
 * gate. Two things make it different from every other screen behind that
 * gate:
 *
 * 1. Opening the link DOES sign the browser in. `detectSessionInUrl` (on by
 *    default, see supabase.ts) reads the token Supabase put in the URL and
 *    establishes a real session for this user before this component ever
 *    renders — that IS the account's normal session, just reached by a
 *    recovery link instead of a password. If this page were routed through
 *    RequireAuth, that gate would treat the new session as an ordinary
 *    sign-in, resolve the client link, and — for anyone already linked —
 *    drop them straight onto the dashboard, skipping the password form
 *    entirely, which defeats the reason they clicked the link.
 * 2. The session can arrive a beat after mount — the URL is parsed
 *    asynchronously. A plain `getSession()` on mount can race the parse, so
 *    this also listens for the `PASSWORD_RECOVERY` event (and `SIGNED_IN`,
 *    since some Supabase versions fire that instead depending on the flow)
 *    to move out of the "checking" state properly instead of ever guessing.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const mounted = useRef(true);

  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    const client = supabase;

    void client.auth.getSession().then(({ data }) => {
      if (!mounted.current) return;
      if (data.session) setHasRecoverySession(true);
      setChecking(false);
    });

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setHasRecoverySession(true);
        setChecking(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError({ message: supabaseConfigError ?? 'Supabase is not configured.', hint: null, code: 'CONFIG' });
      return;
    }

    const validationError = validateNewPassword(password, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);
    const err = await updatePassword(supabase, password);
    if (!mounted.current) return;
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <AuthLayout title="Password updated" description="Your new password is saved.">
        <div className="space-y-4">
          <p className="text-sm text-slate-700">You are signed in with it.</p>
          <button type="button" className="btn-primary w-full" onClick={() => navigate('/', { replace: true })}>
            Continue to the dashboard
          </button>
        </div>
      </AuthLayout>
    );
  }

  if (checking) {
    return (
      <AuthLayout title="Reset your password" description="Checking your reset link…">
        <div className="skeleton h-10 w-full" />
      </AuthLayout>
    );
  }

  if (!hasRecoverySession) {
    return (
      <AuthLayout
        title="This link no longer works"
        description="Reset links expire after a few minutes and only work once."
        footer={
          <Link to="/login" className="font-medium text-brand-700 underline underline-offset-2">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-slate-700">
          Go back to sign in and choose "Forgot password?" again for a fresh link.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" description="At least 8 characters.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <FormError error={error} /> : null}

        <Field
          label="New password"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Confirm password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthLayout>
  );
}
