import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthLayout, Field, FormError } from '../components/AuthLayout';
import { useAuth } from '../data/AuthProvider';
import type { FriendlyError } from '../lib/supabase';

export function SignUpPage() {
  const { status, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  if (status === 'ready') return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err, needsEmailConfirmation } = await signUp(email, password, inviteCode);
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    if (needsEmailConfirmation) {
      setConfirmSent(true);
      setBusy(false);
    }
  };

  if (confirmSent) {
    return (
      <AuthLayout
        title="Confirm your email"
        description="Your account has been created, but it is not active yet."
        footer={
          <Link to="/login" className="font-medium text-brand-700 underline underline-offset-2">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Supabase has emailed a confirmation link to{' '}
            <span className="font-medium text-slate-900">{email.trim()}</span>. Open it, then sign
            in.
          </p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Your invite code has been saved and will be applied automatically the first time you
            sign in, so you do not need to enter it again.
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign up"
      description="An invite code is required. It decides which client's leads you can see."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 underline underline-offset-2">
            Sign in
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          label="Invite code"
          type="text"
          name="inviteCode"
          required
          spellCheck={false}
          autoCapitalize="none"
          hint="Matched exactly, including capitalisation."
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
        />

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
