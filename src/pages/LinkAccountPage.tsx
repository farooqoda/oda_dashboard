import { useState, type FormEvent } from 'react';
import { AuthLayout, Field, FormError } from '../components/AuthLayout';
import { useAuth } from '../data/AuthProvider';
import { AUTH_TABLES } from '../lib/auth';
import type { FriendlyError } from '../lib/supabase';

/**
 * Signed in, but no row in gab_user_clients. Without this screen the user
 * would land on a dashboard that is empty for reasons RLS will never explain.
 */
export function LinkAccountPage() {
  const { user, linkError, linkWithInvite, signOut } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<FriendlyError | null>(linkError);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await linkWithInvite(inviteCode);
    if (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Link your account"
      description="You are signed in, but your account is not attached to a client yet."
      footer={
        <button
          type="button"
          className="font-medium text-brand-700 underline underline-offset-2"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <FormError error={error} /> : null}

        <p className="text-sm text-slate-600">
          Signed in as <span className="font-medium text-slate-900">{user?.email ?? 'unknown'}</span>
          . Enter an invite code to finish setting up access. Until then there is nothing to show —
          every lead query is scoped to the client your account belongs to.
        </p>

        <Field
          label="Invite code"
          type="text"
          name="inviteCode"
          required
          spellCheck={false}
          autoCapitalize="none"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
        />

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Linking…' : 'Link account'}
        </button>

        <p className="text-xs text-slate-500">
          If you have already used your code, an administrator needs to add your row to{' '}
          <span className="font-mono">{AUTH_TABLES.userClients}</span> directly.
        </p>
      </form>
    </AuthLayout>
  );
}
