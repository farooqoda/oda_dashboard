import { useEffect, useState } from 'react';
import { Card, CopyButton, PageHeader } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import { useLeads } from '../data/LeadsProvider';
import { fetchAccountRecord, type AccountRecord } from '../lib/auth';
import { MAX_ROWS, SUPPORT_EMAIL } from '../lib/constants';
import { supabase } from '../lib/supabase';

/**
 * Deliberately free of backend branding: no vendor name, no project URL, no
 * hostname, no mention of the database engine or of API keys. Everything here
 * is scoped to the signed-in user by Row Level Security, so "your account" is
 * literally what the numbers describe — including the licence key, which is
 * read from the user's own gab_users row (user_id = auth.uid()) and shown here
 * so it can be recovered after the one-time Setup complete screen has gone.
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

/** The signed-in user's own gab_users row: licence key and recorded email. */
function useAccountRecord(userId: string | null | undefined) {
  const [record, setRecord] = useState<AccountRecord | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    // Two attempts, not four: on Settings the row either exists or the user
    // needs to hear so, and a long backoff is just a stalled panel.
    void fetchAccountRecord(supabase, userId, 2).then((result) => {
      if (!cancelled) setRecord(result);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return record;
}

/**
 * Same treatment as the Setup complete screen: a selectable monospace block
 * with a Copy button, and an explanation of which of the user's two
 * credentials this one is.
 */
function LicenseKeyBlock({ record }: { record: AccountRecord | null }) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <h3 className="text-sm font-semibold text-slate-900">Your LinkedIn extension key</h3>

      {record === null ? (
        <div className="mt-2">
          <div className="skeleton h-10 w-full" />
        </div>
      ) : record.licenseKey.state === 'found' ? (
        <>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
              {record.licenseKey.licenseKey}
            </code>
            <CopyButton text={record.licenseKey.licenseKey} className="btn-secondary shrink-0" />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            Paste this as your password when the LinkedIn extension asks you to log in, using the
            email on your account. It is not the password you signed in here with.
          </p>
        </>
      ) : (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {record.licenseKey.state === 'missing'
            ? 'No key has been generated for your account yet.'
            : record.licenseKey.state === 'empty'
              ? 'Your account record exists, but no key has been set on it.'
              : 'Your key could not be read just now.'}{' '}
          Ask{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>{' '}
          to send it to you. The dashboard works normally without it — it is only needed by the
          LinkedIn extension.
        </p>
      )}
    </div>
  );
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
  const record = useAccountRecord(user?.id);
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
            <Row
              label="Email on your account"
              value={
                record === null ? (
                  <span className="skeleton inline-block h-3 w-32 align-middle" />
                ) : (
                  record.email ?? 'Not set'
                )
              }
            />
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

          <LicenseKeyBlock record={record} />

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
