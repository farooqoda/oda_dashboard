import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState, ErrorState, InlineError, PageHeader, SkeletonCards } from '../components/ui';
import { amPlatformAdmin } from '../lib/team';
import {
  TEAM_ID,
  loadTeams,
  parseEmails,
  removeDomain,
  removeManager,
  setupTeam,
  type SetupLine,
  type TeamDomain,
  type TeamPerson,
} from '../lib/teamsAdmin';
import type { FriendlyError } from '../lib/supabase';

type Data = { people: TeamPerson[]; domains: TeamDomain[]; clients: { client_id: string; members: number }[] };

function Results({ lines }: { lines: SetupLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="mt-3 space-y-1 rounded-md bg-slate-50 p-3 text-xs" aria-label="What happened">
      {lines.map((l) => (
        <li key={l.email} className={/^NOT /.test(l.result) ? 'text-amber-800' : 'text-slate-700'}>
          <b>{l.email}</b> — {l.result}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// New team
// ---------------------------------------------------------------------------
function NewTeamCard({ existing, onDone }: { existing: string[]; onDone: () => void }) {
  const [id, setId] = useState('');
  const [manager, setManager] = useState('');
  const [members, setMembers] = useState('');
  const [domain, setDomain] = useState('');
  const [move, setMove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [lines, setLines] = useState<SetupLine[]>([]);
  const m = parseEmails(members);
  const mgr = parseEmails(manager);
  const idOk = TEAM_ID.test(id);
  const taken = existing.some((c) => c.toLowerCase() === id.toLowerCase());
  const domainOk = !domain.trim() || /^@?[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.trim());
  const valid = idOk && !taken && mgr.ok.length === 1 && mgr.bad.length === 0 && m.bad.length === 0 && domainOk;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    setLines([]);
    const r = await setupTeam({ client: id, manager: mgr.ok[0], members: m.ok, domain: domain.trim(), move });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setLines(r.data);
    setId('');
    setManager('');
    setMembers('');
    setDomain('');
    setMove(false);
    onDone();
  };

  return (
    <Card title="New team" description="A company or group: one manager (team lead) and the people under them." className="mb-6">
      <div className="grid gap-4 text-sm md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label">Team name (id)</span>
          <input className="input" value={id} onChange={(e) => setId(e.target.value.replace(/\s+/g, '_'))} placeholder="ACME" />
          <span className="text-xs text-slate-500">
            {id && !idOk ? 'Use 2–40 letters, digits, _ or -.' : taken ? 'There is already a team with this name.' : 'Letters, digits, _ or -. It cannot be changed later.'}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Manager / team lead email</span>
          <input className="input" type="email" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="lead@acme.com" />
          <span className="text-xs text-slate-500">Sees the team’s numbers on the Team page. Does not see members’ leads.</span>
        </label>
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="label">Members’ emails</span>
          <textarea
            className="input min-h-[90px]"
            value={members}
            onChange={(e) => setMembers(e.target.value)}
            placeholder={'ali@acme.com\nsara@acme.com'}
          />
          <span className={`text-xs ${m.bad.length ? 'text-red-700' : 'text-slate-500'}`}>
            {m.bad.length ? `Not an email: ${m.bad.join(', ')}` : `One per line or separated by commas. ${m.ok.length ? `${m.ok.length} people.` : 'You can add more later.'}`}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Company email domain (optional)</span>
          <input className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
          <span className={`text-xs ${domainOk ? 'text-slate-500' : 'text-red-700'}`}>
            {domainOk ? 'Anyone who signs up with an email at this domain joins the team by themselves.' : 'Write the domain like acme.com'}
          </span>
        </label>
        <label className="flex items-start gap-2 self-center text-sm">
          <input type="checkbox" className="mt-1" checked={move} onChange={(e) => setMove(e.target.checked)} />
          <span>
            Also move people who <b>already use the app</b> in another team, with all their own work
            <span className="block text-xs text-slate-500">Off: they stay where they are and are listed below as not moved.</span>
          </span>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="button" className="btn-primary" disabled={!valid || busy} onClick={() => void submit()}>
          {busy ? 'Creating…' : 'Create team'}
        </button>
        <span className="text-xs text-slate-500">People who have not signed up yet join the team when they sign up with that email.</span>
      </div>
      {err ? (
        <div className="mt-3">
          <InlineError error={err} title="The team was not created." />
        </div>
      ) : null}
      <Results lines={lines} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One team
// ---------------------------------------------------------------------------
const ROLE_PILL: Record<string, string> = {
  manager: 'bg-ink text-white',
  member: 'bg-slate-100 text-slate-700',
  'manager (of another team)': 'bg-sky-100 text-sky-900',
  'manager (not signed up yet)': 'bg-amber-100 text-amber-900',
};

function TeamCard({ client, people, domains, onChanged }: { client: string; people: TeamPerson[]; domains: TeamDomain[]; onChanged: () => void }) {
  const [add, setAdd] = useState('');
  const [move, setMove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [lines, setLines] = useState<SetupLine[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const emails = parseEmails(add);
  const managers = people.filter((p) => p.role.startsWith('manager'));

  const run = async (key: string, fn: () => Promise<{ error: FriendlyError | null; data?: SetupLine[] | null }>) => {
    setBusy(key);
    setErr(null);
    setLines([]);
    const r = await fn();
    setBusy(null);
    if (r.error) return setErr(r.error);
    if (r.data) setLines(r.data);
    onChanged();
  };
  const plain = async (p: Promise<FriendlyError | null>) => ({ error: await p });

  return (
    <section className="card mb-4" aria-label={`Manage ${client}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-900">
          {client}{' '}
          <span className="text-sm font-normal text-slate-500">
            · {people.filter((p) => p.role === 'member' || p.role === 'manager').length} people
            {managers.length ? ` · manager: ${managers.map((m) => m.email).join(', ')}` : ' · no manager yet'}
          </span>
        </h2>
        <span className="flex flex-wrap items-center gap-1">
          {domains.map((d) => (
            <span key={d.pattern} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-900">
              anyone {d.pattern}
              <button
                type="button"
                className="text-emerald-700 hover:text-red-700"
                aria-label={`Stop ${d.pattern} joining ${client}`}
                disabled={busy !== null}
                onClick={() => void run('dom-' + d.pattern, () => plain(removeDomain(d.pattern)))}
              >
                ×
              </button>
            </span>
          ))}
        </span>
      </header>
      <div className="p-4">
        {people.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {people.map((p) => (
              <li key={p.email + p.role} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">
                  {p.email} <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_PILL[p.role] ?? ''}`}>{p.role}</span>
                </span>
                {p.role === 'member' ? (
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={busy !== null}
                    onClick={() => void run('mgr-' + p.email, () => setupTeam({ client, manager: p.email }))}
                  >
                    Make manager
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={busy !== null}
                    onClick={() => void run('rm-' + p.email, () => plain(removeManager(p.email, client)))}
                  >
                    Remove as manager
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Nobody has joined yet.</p>
        )}

        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex flex-col gap-1">
              <span className="label">Add people</span>
              <textarea className="input min-h-[60px]" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="new.person@acme.com" />
            </label>
            <span className={`text-xs ${emails.bad.length ? 'text-red-700' : 'text-slate-500'}`}>
              {emails.bad.length ? `Not an email: ${emails.bad.join(', ')}` : 'One per line or separated by commas.'}
            </span>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} />
              Move people already in another team, with their work
            </label>
          </div>
          <div className="flex flex-col gap-2 self-start pt-6">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy !== null || !emails.ok.length || emails.bad.length > 0}
              onClick={() =>
                void run('add', async () => {
                  const r = await setupTeam({ client, members: emails.ok, move });
                  if (!r.error) {
                    setAdd('');
                    setMove(false);
                  }
                  return r;
                })
              }
            >
              {busy === 'add' ? 'Adding…' : 'Add to team'}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <input className="input w-48 py-1" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="acme.com" aria-label={`Email domain for ${client}`} />
          <button
            type="button"
            className="btn-ghost text-xs"
            disabled={busy !== null || !/^@?[a-z0-9.-]+\.[a-z]{2,}$/i.test(newDomain.trim())}
            onClick={() =>
              void run('dom', async () => {
                const r = await setupTeam({ client, domain: newDomain.trim() });
                if (!r.error) setNewDomain('');
                return r;
              })
            }
          >
            Let anyone with this email domain join
          </button>
        </div>
        {err ? (
          <div className="mt-3">
            <InlineError error={err} title="That did not work." />
          </div>
        ) : null}
        <Results lines={lines} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function ManageTeamsPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    const r = await loadTeams();
    if (r.error) setError(r.error);
    else {
      setError(null);
      setData(r.data);
    }
  }, []);
  useEffect(() => {
    void amPlatformAdmin().then((a) => {
      setAdmin(a);
      if (a) void load();
    });
  }, [load]);

  const allIds = useMemo(() => {
    if (!data) return [];
    return [...new Set<string>([...data.clients.map((c) => c.client_id), ...data.people.map((p) => p.client_id), ...data.domains.map((d) => d.client_id)])];
  }, [data]);
  const teams = useMemo(() => {
    if (!data) return [];
    return allIds
      .filter((id) => !filter || id.toLowerCase().includes(filter.toLowerCase()) || data.people.some((p) => p.client_id === id && p.email.includes(filter.toLowerCase())))
      .sort((a, b) => a.localeCompare(b));
  }, [data, allIds, filter]);

  if (admin === false) {
    return (
      <>
        <PageHeader title="Manage teams" />
        <EmptyState title="Only the platform admin can manage teams">Ask your administrator.</EmptyState>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Manage teams"
        description="Create teams, add people, choose each team’s manager. Members see only their own work; managers see their team’s numbers on the Team page."
        actions={
          <Link to="/team" className="btn-secondary">
            ← Team activity
          </Link>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : !data ? (
        <SkeletonCards count={3} />
      ) : (
        <>
          <NewTeamCard existing={allIds} onDone={() => void load()} />
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Teams ({teams.length})</h2>
            <input className="input w-60 py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a team or email" aria-label="Find a team or email" />
          </div>
          {teams.map((id) => (
            <TeamCard
              key={id}
              client={id}
              people={data.people.filter((p) => p.client_id === id)}
              domains={data.domains.filter((d) => d.client_id === id)}
              onChanged={() => void load()}
            />
          ))}
        </>
      )}
    </>
  );
}
