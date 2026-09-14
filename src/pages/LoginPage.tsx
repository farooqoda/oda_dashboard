import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AuthLayout, Field, FormError } from '../components/AuthLayout';
import { useAuth } from '../data/AuthProvider';
import { requestPasswordReset } from '../lib/auth';
import { supabase, supabaseConfigError, type FriendlyError } from '../lib/supabase';

type View = 'signin' | 'forgot' | 'sent';

export function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: go where they were headed, or to the dashboard.
  if (status === 'ready' || status === 'unlinked') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }

  const goTo = (next: View) => {
    setView(next);
    setError(null);
  };

  const onSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    if (err) {
      setError(err);
      setBusy(false);
    }
    // On success the auth listener swaps the route out; leave `busy` set so the
    // button cannot be pressed twice during the transition.
  };

  const onRequestReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError({ message: supabaseConfigError ?? 'Supabase is not configured.', hint: null, code: 'CONFIG' });
      return;
    }
    setBusy(true);
    setError(null);
    const err = await requestPasswordReset(supabase, email);
    setBusy(false);
    // A failed request (bad address, rate limit, no network) is shown — that
    // is a problem with the request itself, not a leak of whether the
    // account exists. Anything that reaches Supabase resolves the same way
    // either way, and gets the same confirmation screen either way.
    if (err) {
      setError(err);
      return;
    }
    setView('sent');
  };

  if (view === 'sent') {
    return (
      <AuthLayout
        title="Check your email"
        description="If that address has an account, a reset link is on its way."
        footer={
          <button
            type="button"
            onClick={() => goTo('signin')}
            className="font-medium text-brand-700 underline underline-offset-2"
          >
            Back to sign in
          </button>
        }
      >
        <p className="text-sm text-slate-700">
          Open the link in the email sent to{' '}
          <span className="font-medium text-slate-900">{email.trim()}</span> to choose a new
          password. It expires after a few minutes and works once.
        </p>
      </AuthLayout>
    );
  }

  if (view === 'forgot') {
    return (
      <AuthLayout
        title="Reset your password"
        description="Enter the email address you sign in with."
        footer={
          <button
            type="button"
            onClick={() => goTo('signin')}
            className="font-medium text-brand-700 underline underline-offset-2"
          >
            Back to sign in
          </button>
        }
      >
        <form onSubmit={onRequestReset} className="space-y-4">
          {error ? <FormError error={error} /> : null}

          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in"
      description="Use the email address your invite was sent to."
      footer={
        <>
          Do not have an account yet?{' '}
          <Link to="/signup" className="font-medium text-brand-700 underline underline-offset-2">
            Sign up with an invite code
          </Link>
        </>
      }
    >
      <form onSubmit={onSignIn} className="space-y-4">
        {error ? <FormError error={error} /> : null}

        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div>
          <Field
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => goTo('forgot')}
            className="mt-1.5 text-xs font-medium text-brand-700 underline underline-offset-2"
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
