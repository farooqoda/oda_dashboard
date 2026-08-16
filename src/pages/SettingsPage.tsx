import { useEffect, useState } from 'react';
import { Card, ErrorState, PageHeader } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import { useLeads } from '../data/LeadsProvider';
import { MAX_ROWS } from '../lib/constants';
import { formatDateTime, isProfiled } from '../lib/format';
import { supabase, supabaseUrl, toFriendlyError, type FriendlyError } from '../lib/supabase';

/** Exact row counts, asked for with head-only count queries. */
function useRowCounts() {
  const [counts, setCounts] = useState<{ leads: number | null; activity: number | null }>({
    leads: null,
    activity: null,
  });
  const [error, setError] = useState<FriendlyError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const run = async () => {
      const [leadsRes, activityRes] = await Promise.all([
        supabase!.from('gab_leads').select('id', { count: 'exact', head: true }),
        supabase!.from('gab_activity').select('id', { count: 'exact', head: true }),
      ]);
      if (cancelled) return;

      const firstError = leadsRes.error ?? activityRes.error;
      if (firstError) setError(toFriendlyError(firstError));

      setCounts({
        leads: leadsRes.count ?? null,
        activity: activityRes.count ?? null,
      });
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { counts, error, loading };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="break-all text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const { leads, error: leadsError, lastLoadedAt } = useLeads();
  const { user, clientId } = useAuth();
  const { counts, error: countError, loading } = useRowCounts();

  const connected = !!supabase && !leadsError;
  const profiled = leads.filter(isProfiled).length;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Read-only. Nothing on this screen changes anything."
      />

      {leadsError ? (
        <div className="mb-6">
          <ErrorState error={leadsError} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Supabase connection">
          <div className="divide-y divide-slate-100">
            <Row
              label="Status"
              value={
                <span
                  className={`pill ${
                    connected
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {connected ? 'Connected' : 'Not connected'}
                </span>
              }
            />
            <Row label="Project URL" value={supabaseUrl ?? 'Not configured'} />
            <Row label="Signed in as" value={user?.email ?? 'Not signed in'} />
            <Row
              label="Client"
              value={
                clientId ? (
                  <span className="font-mono">{clientId}</span>
                ) : (
                  'Not linked to a client'
                )
              }
            />
            <Row
              label="Access"
              value="Your own Supabase Auth session. Row Level Security scopes every query to your client — this app applies no client filter of its own."
            />
            <Row
              label="Last successful load"
              value={lastLoadedAt ? (formatDateTime(lastLoadedAt.toISOString()) ?? '—') : 'Never'}
            />
          </div>
        </Card>

        <Card title="Row counts" description="Counted by the database, not by what is loaded here.">
          {countError ? (
            <ErrorState error={countError} />
          ) : (
            <div className="divide-y divide-slate-100">
              <Row
                label="gab_leads"
                value={loading ? <span className="skeleton inline-block h-3 w-10" /> : (counts.leads?.toLocaleString() ?? 'Unavailable')}
              />
              <Row
                label="gab_activity"
                value={loading ? <span className="skeleton inline-block h-3 w-10" /> : (counts.activity?.toLocaleString() ?? 'Unavailable')}
              />
              <Row label="Leads loaded in this session" value={leads.length.toLocaleString()} />
              <Row label="Of those, profiled (traits present)" value={profiled.toLocaleString()} />
              <Row label="Fetch limit per load" value={`${MAX_ROWS.toLocaleString()} rows`} />
            </div>
          )}
          {!countError && counts.leads !== null && counts.leads > MAX_ROWS ? (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              gab_leads holds more rows than this app fetches. Everything on screen is computed from
              the newest {MAX_ROWS.toLocaleString()} rows by created_at, not the full table.
            </p>
          ) : null}
        </Card>

        <Card title="Tables this app can reach" className="lg:col-span-2">
          <div className="divide-y divide-slate-100">
            <Row label="gab_leads" value="Read and update (stage, connection status, review status)" />
            <Row label="gab_activity" value="Read only" />
            <Row
              label="gab_client_invites, gab_user_clients"
              value="Touched only during sign up and sign in, to resolve which client an account belongs to"
            />
            <Row
              label="gab_users, gab_clients, gab_frameworks, gab_invite_log"
              value="Not accessible — deliberately locked by Row Level Security"
            />
          </div>
          <p className="mt-4 text-sm text-slate-600">
            Prompt configuration, profiling frameworks and invite logs are managed in the database.
            They are not editable here, and this dashboard does not read them.
          </p>
        </Card>
      </div>
    </>
  );
}
