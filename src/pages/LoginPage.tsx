import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AuthLayout, Field, FormError } from '../components/AuthLayout';
import { useAuth } from '../data/AuthProvider';
import type { FriendlyError } from '../lib/supabase';

export function LoginPage() {
  const { status, signIn } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in: go where they were headed, or to the dashboard.
  if (status === 'ready' || status === 'unlinked') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
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
      <form onSubmit={onSubmit} className="space-y-4">
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
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}
