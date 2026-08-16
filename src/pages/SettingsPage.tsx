import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import { useLeads } from '../data/LeadsProvider';
import { MAX_ROWS, SUPPORT_EMAIL } from '../lib/constants';
import { supabase } from '../lib/supabase';

/**
 * Deliberately free of backend branding: no vendor name, no project URL, no
 * hostname, no mention of the database engine or of API keys. Everything here
 * is scoped to the signed-in user by Row Level Security, so "your account" is
 * literally what the numbers describe.
 *
 * This is also the one screen that does NOT surface raw query errors. Every
 * other screen still shows the real message, because those are working
 * surfaces where diagnosing a failure matters; here a failure is reported as
 * a plain status with a route to a human.
 */

/** Total leads visible to this account. RLS scopes the count. */
function useAccountLeadCount() {
  const [count, setCount] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setFailed(true);
      return;
    }
    let cancelled = false;

    void supabase
      .from('gab_leads')
      .select('id', { count: 'exact', head: true })
      .then(({ count: total, error }) => {
        if (cancelled) return;
        if (error) setFailed(true);
        else setCount(total ?? 0);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { count, failed, loading };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="break-words text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const { error: leadsError } = useLeads();
  const { user, clientId, clientName, signOut } = useAuth();
  const { count, failed, loading } = useAccountLeadCount();
  const [signingOut, setSigningOut] = useState(false);

  const connected = !leadsError && !failed;

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <>
      <PageHeader title="Settings" description="Read-only. Nothing on this screen changes anything." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Your account">
          <div className="divide-y divide-slate-100">
            <Row label="Signed in as" value={user?.email ?? 'Not signed in'} />
            <Row label="Client" value={clientName ?? clientId ?? 'Not linked to a client'} />
            <Row
              label="Total leads in your account"
              value={
                loading ? (
                  <span className="skeleton inline-block h-3 w-10 align-middle" />
                ) : count === null ? (
                  'Unavailable'
                ) : (
                  count.toLocaleString()
                )
              }
            />
          </div>

          {count !== null && count > MAX_ROWS ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Your account holds more leads than the dashboard loads at once. Screens are built
              from the {MAX_ROWS.toLocaleString()} most recent leads, not all{' '}
              {count.toLocaleString()}.
            </p>
          ) : null}

          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            {signingOut ? 'Logging out…' : 'Log out'}
          </button>
        </Card>

        <Card title="System">
          <div className="divide-y divide-slate-100">
            <Row
              label="System status"
              value={
                <span
                  className={`pill ${
                    connected
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: connected ? '#0ca30c' : '#d03b3b' }}
                  />
                  {connected ? 'Connected' : 'Unavailable'}
                </span>
              }
            />
          </div>

          {!connected ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              Your lead data could not be reached just now. Try reloading the page; if it keeps
              happening, contact support with the time you saw this.
            </p>
          ) : null}

          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              Need help, a new invite code, or a change to your account? Contact{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-brand-700 underline underline-offset-2"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Lead profiling, message generation and account provisioning all run outside this
              dashboard and are not configurable here.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
