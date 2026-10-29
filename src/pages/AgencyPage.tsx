import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, InlineError, PageHeader, SkeletonCards } from '../components/ui';
import { amPlatformAdmin } from '../lib/team';
import {
  addAgencyPeople,
  agencyPersonAction,
  createAgencyClient,
  loadAgenciesList,
  loadAgencyClients,
  loadAgencyPeople,
  loadMyAgencies,
  parseEmailList,
  renameAgencyClient,
  setAgencyBrand,
  upsertAgency,
  type Agency,
  type AgencyClient,
  type AgencyPerson,
  type AgencyRow,
} from '../lib/agency';
import type { FriendlyError } from '../lib/supabase';

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '—');

function Dot({ n, tone, label }: { n: number; tone: string; label: string }) {
  if (!n) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-700" title={label}>
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
      {n} {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// People of one client
// ---------------------------------------------------------------------------
function PeoplePanel({ client, onChanged }: { client: AgencyClient; onChanged: () => void }) {
  const [people, setPeople] = useState<AgencyPerson[] | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [emails, setEmails] = useState('');
  const [manager, setManager] = useState('');
  const [results, setResults] = useState<{ email: string; result: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(client.client_name);

  const load = useCallback(async () => {
    const r = await loadAgencyPeople(client.client_id);
    if (r.error) setError(r.error);
    else setPeople(r.data ?? []);
  }, [client.client_id]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (email: string, action: Parameters<typeof agencyPersonAction>[2]) => {
    setBusy(true);
    const r = await agencyPersonAction(client.client_id, email, action);
    setBusy(false);
    if (r.error) return setError(r.error);
    setError(null);
    await load();
    onChanged();
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50/60 px-5 py-4" aria-label={`People in ${client.client_name}`}>
      {error ? <InlineError error={error} /> : null}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Client name
          <input className="input w-64 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || !name.trim() || name.trim() === client.client_name}
          onClick={async () => {
            const r = await renameAgencyClient(client.client_id, name.trim());
            if (r.error) setError(r.error);
            else onChanged();
          }}
        >
          Rename
        </button>
      </div>
      {!people ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : people.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">Nobody here yet. Invite the people who will send from their LinkedIn accounts.</p>
      ) : (
        <div className="relative mb-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-2 pr-2 font-medium">Person</th>
                <th className="px-2 py-2 font-medium">State</th>
                <th className="px-2 py-2 font-medium">Role</th>
                <th className="py-2 pl-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.email} className="border-t border-slate-200/70">
                  <td className="py-2 pr-2 font-medium text-slate-900">{p.email}</td>
                  <td className="px-2 py-2">
                    {p.state === 'invited' ? (
                      <span className="text-xs text-amber-700">Invited — not signed up yet</span>
                    ) : p.state === 'paused' ? (
                      <span className="text-xs text-rose-700">Paused (seat free)</span>
                    ) : (
                      <span className="text-xs text-emerald-700">Active</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-600">{p.is_manager ? 'Manager' : 'Member'}</td>
                  <td className="py-2 pl-2 text-right">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      {p.state === 'invited' ? (
                        <button type="button" className="btn-secondary px-2.5 py-1 text-xs" disabled={busy} onClick={() => void act(p.email, 'cancel_invite')}>
                          Cancel invitation
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-secondary px-2.5 py-1 text-xs"
                            disabled={busy}
                            onClick={() => void act(p.email, p.is_manager ? 'remove_manager' : 'make_manager')}
                          >
                            {p.is_manager ? 'Remove manager' : 'Make manager'}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-2.5 py-1 text-xs"
                            disabled={busy}
                            onClick={() => void act(p.email, p.state === 'paused' ? 'resume' : 'pause')}
                          >
                            {p.state === 'paused' ? 'Resume' : 'Pause'}
                          </button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="grid gap-2 md:grid-cols-[1fr_220px_auto] md:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const list = parseEmailList(emails);
          if (!list.length && !manager.trim()) return;
          setBusy(true);
          const r = await addAgencyPeople(client.client_id, list, manager.trim() || null);
          setBusy(false);
          if (r.error) return setError(r.error);
          setError(null);
          setResults(r.data ?? []);
          setEmails('');
          setManager('');
          await load();
          onChanged();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Invite people (emails, one per line or separated by commas)
          <textarea className="input min-h-[64px] text-sm" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="sara@client.com, omar@client.com" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Manager (optional)
          <input className="input py-1.5 text-sm" value={manager} onChange={(e) => setManager(e.target.value)} placeholder="lead@client.com" />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          Invite
        </button>
      </form>
      {results.length ? (
        <ul className="mt-3 space-y-1 rounded-md bg-white p-3 text-xs" aria-label="What happened">
          {results.map((r) => (
            <li key={r.email} className={/^NOT /.test(r.result) ? 'text-amber-800' : 'text-slate-700'}>
              <b>{r.email}</b>: {r.result}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">
        Invited people create their dashboard account with that same email (no invite code needed), install the extension and sign in. Pausing stops their extension and frees the
        seat; their work stays in the reports.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand for client reports
// ---------------------------------------------------------------------------
function BrandCard({ agency, onSaved }: { agency: Agency; onSaved: () => void }) {
  const [brand, setBrand] = useState(agency.brand_name ?? '');
  const [logo, setLogo] = useState(agency.logo_url ?? '');
  const [note, setNote] = useState(agency.report_note ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  return (
    <section className="card mb-6" aria-label="Report branding">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-900">Your brand on client reports</h2>
        <p className="text-xs text-slate-500">Client reports show your name and logo, not ours.</p>
      </header>
      <form
        className="grid gap-3 p-5 md:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await setAgencyBrand(agency.agency_id, brand, logo, note);
          if (r.error) {
            setError(r.error);
            setMsg(null);
          } else {
            setError(null);
            setMsg('Saved');
            onSaved();
          }
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Agency name on reports
          <input className="input py-1.5 text-sm" value={brand} maxLength={80} onChange={(e) => setBrand(e.target.value)} placeholder={agency.name} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Logo link (https://…png or .svg)
          <input className="input py-1.5 text-sm" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://youragency.com/logo.png" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600 md:col-span-2">
          Note at the bottom of every report (optional)
          <textarea className="input min-h-[56px] text-sm" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder="Questions about this report? Reply to your account manager." />
        </label>
        <div className="flex items-center gap-3 md:col-span-2">
          <button type="submit" className="btn-primary">
            Save
          </button>
          {msg ? <span className="text-xs text-emerald-700">{msg}</span> : null}
          {error ? <InlineError error={error} /> : null}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Platform admin: agencies
// ---------------------------------------------------------------------------
function AgenciesAdmin({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<AgencyRow[] | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [f, setF] = useState({ id: '', name: '', seats: '10', admin: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await loadAgenciesList();
    if (r.error) setError(r.error);
    else setRows(r.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="card mb-6" aria-label="Agencies (platform admin)">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-base font-semibold text-slate-900">Agencies <span className="text-xs font-normal text-slate-500">· platform admin</span></h2>
        <p className="text-xs text-slate-500">Create an agency and its admin. The admin then creates client workspaces and invites people up to the seats you give.</p>
      </header>
      <div className="p-5">
        {error ? <InlineError error={error} /> : null}
        {rows && rows.length ? (
          <div className="relative mb-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-2 font-medium">Agency</th>
                  <th className="px-2 py-2 font-medium">Seats used</th>
                  <th className="px-2 py-2 font-medium">Clients</th>
                  <th className="px-2 py-2 font-medium">Admins</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.agency_id} className="border-t border-slate-200/70">
                    <td className="py-2">
                      <b>{a.name}</b> <span className="text-xs text-slate-500">({a.agency_id})</span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {a.seats_used} / {a.seats}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{a.clients}</td>
                    <td className="px-2 py-2 text-xs text-slate-600">{a.admins || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : rows ? (
          <p className="mb-4 text-sm text-slate-500">No agencies yet.</p>
        ) : null}
        <form
          className="grid gap-2 md:grid-cols-[160px_1fr_90px_1fr_auto] md:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await upsertAgency(f.id.trim().toLowerCase(), f.name.trim(), Number(f.seats), f.admin.trim());
            if (r.error) {
              setError(r.error);
              setMsg(null);
              return;
            }
            setError(null);
            setMsg(r.data);
            setF({ id: '', name: '', seats: '10', admin: '' });
            await load();
            onChanged();
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Agency id
            <input className="input py-1.5 text-sm" value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="growthco" required pattern="[a-z0-9][a-z0-9_-]{1,39}" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Name
            <input className="input py-1.5 text-sm" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Growth Co" required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Seats
            <input className="input py-1.5 text-sm" type="number" min={1} max={1000} value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} required />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Admin email
            <input className="input py-1.5 text-sm" type="email" value={f.admin} onChange={(e) => setF({ ...f, admin: e.target.value })} placeholder="owner@growthco.com" />
          </label>
          <button type="submit" className="btn-primary">
            Save agency
          </button>
        </form>
        {msg ? <p className="mt-2 text-xs text-emerald-700">{msg}</p> : null}
        <p className="mt-2 text-xs text-slate-500">Same id again = change the name, seats or add another admin.</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function AgencyPage() {
  const [admin, setAdmin] = useState(false);
  const [agencies, setAgencies] = useState<Agency[] | null>(null);
  const [agencyId, setAgencyId] = useState('');
  const [clients, setClients] = useState<AgencyClient[] | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [addErr, setAddErr] = useState<FriendlyError | null>(null);

  const loadAgencies = useCallback(async () => {
    const r = await loadMyAgencies();
    if (r.error) {
      setMissing(!!r.missing);
      setError(r.error);
      return;
    }
    setAgencies(r.data ?? []);
    setAgencyId((cur) => (cur && (r.data ?? []).some((a) => a.agency_id === cur) ? cur : (r.data?.[0]?.agency_id ?? '')));
  }, []);
  useEffect(() => {
    void amPlatformAdmin().then(setAdmin);
    void loadAgencies();
  }, [loadAgencies]);
  const agency = useMemo(() => agencies?.find((a) => a.agency_id === agencyId) ?? null, [agencies, agencyId]);

  const loadClients = useCallback(async () => {
    if (!agencyId) return setClients([]);
    const r = await loadAgencyClients(agencyId);
    if (r.error) setError(r.error);
    else {
      setError(null);
      setClients(r.data ?? []);
    }
  }, [agencyId]);
  useEffect(() => {
    void loadClients();
  }, [loadClients]);
  const refresh = () => {
    void loadAgencies();
    void loadClients();
  };

  const totals = useMemo(() => {
    const t = { invites: 0, inv30: 0, acc: 0, rep: 0, risk: 0, watch: 0, members: 0 };
    for (const c of clients ?? []) {
      t.invites += c.invites_7d;
      t.inv30 += c.invites_30d;
      t.acc += c.accepted_30d;
      t.rep += c.replies_30d;
      t.risk += c.risk;
      t.watch += c.watch;
      t.members += c.members;
    }
    return t;
  }, [clients]);

  if (missing) {
    return (
      <>
        <PageHeader title="Agency" />
        <EmptyState title="One database step is missing">Run the “Agency workspace” SQL (i3) in Supabase, then refresh.</EmptyState>
      </>
    );
  }
  if (error && !agencies) {
    return (
      <>
        <PageHeader title="Agency" />
        <ErrorState error={error} onRetry={refresh} />
      </>
    );
  }
  if (!agencies) {
    return (
      <>
        <PageHeader title="Agency" />
        <SkeletonCards count={3} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={agency ? agency.name : 'Agency'}
        description="All your client workspaces in one place: who sends from which LinkedIn account, how each client is doing, and a report to send them."
        actions={
          agency ? (
            <>
              <Link to="/team/senders" className="btn-secondary">
                Senders health
              </Link>
              <Link to="/agency/box" className="btn-primary">
                Agency Box (proxies)
              </Link>
            </>
          ) : undefined
        }
      />
      {admin ? <AgenciesAdmin onChanged={refresh} /> : null}
      {agencies.length === 0 ? (
        admin ? null : (
          <EmptyState title="You don’t run an agency here">Ask the platform admin to set up your agency.</EmptyState>
        )
      ) : (
        <>
          {agencies.length > 1 ? (
            <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              Agency
              <select className="input w-64 py-1.5 text-sm" value={agencyId} onChange={(e) => setAgencyId(e.target.value)}>
                {agencies.map((a) => (
                  <option key={a.agency_id} value={a.agency_id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {agency ? (
            <section aria-label="Agency summary" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="card px-4 py-3">
                <span className="block text-2xl font-extrabold tabular-nums text-ink">
                  {agency.seats_used} <span className="text-base font-semibold text-slate-500">/ {agency.seats}</span>
                </span>
                <span className="block text-xs text-slate-600">Seats used</span>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${agency.seats_used >= agency.seats ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (100 * agency.seats_used) / agency.seats)}%` }} />
                </div>
              </div>
              <div className="card px-4 py-3">
                <span className="block text-2xl font-extrabold tabular-nums text-ink">{clients?.length ?? agency.clients}</span>
                <span className="block text-xs text-slate-600">Client workspaces</span>
              </div>
              <div className="card px-4 py-3">
                <span className="block text-2xl font-extrabold tabular-nums text-ink">{totals.invites}</span>
                <span className="block text-xs text-slate-600">Invites, last 7 days</span>
              </div>
              <div className="card px-4 py-3">
                <span className="block text-2xl font-extrabold tabular-nums text-ink">{pct(totals.acc, totals.inv30)}</span>
                <span className="block text-xs text-slate-600">Acceptance, 30 days · {totals.rep} replies</span>
              </div>
              <Link to="/team/senders" className="card px-4 py-3 hover:ring-1 hover:ring-slate-300">
                <span className={`block text-2xl font-extrabold tabular-nums ${totals.risk ? 'text-rose-700' : 'text-ink'}`}>{totals.risk}</span>
                <span className="block text-xs text-slate-600">Accounts at risk · {totals.watch} to watch</span>
              </Link>
            </section>
          ) : null}

          <section className="card mb-6" aria-label="Client workspaces">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">Client workspaces</h2>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newName.trim() || !agencyId) return;
                  const r = await createAgencyClient(agencyId, newName.trim());
                  if (r.error) return setAddErr(r.error);
                  setAddErr(null);
                  setNewName('');
                  await loadClients();
                  void loadAgencies();
                  setOpen(r.data);
                }}
              >
                <input className="input w-56 py-1.5 text-sm" placeholder="New client name" aria-label="New client name" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} />
                <button type="submit" className="btn-primary" disabled={!newName.trim()}>
                  Add client
                </button>
              </form>
            </header>
            {addErr ? (
              <div className="px-5 pt-3">
                <InlineError error={addErr} />
              </div>
            ) : null}
            {!clients ? (
              <p className="px-5 py-6 text-sm text-slate-500">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No clients yet. Add your first client above.</p>
            ) : (
              <ul>
                {clients.map((c) => (
                  <li key={c.client_id} className="border-b border-slate-100 last:border-0">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                      <div className="min-w-[200px] flex-1">
                        <p className="font-semibold text-slate-900">{c.client_name}</p>
                        <p className="text-xs text-slate-500">
                          {c.members} {c.members === 1 ? 'account' : 'accounts'}
                          {c.invited ? ` · ${c.invited} invited` : ''}
                          {c.managers ? ` · manager: ${c.managers}` : ''}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-3">
                          <Dot n={c.risk} tone="bg-rose-500" label="at risk" />
                          <Dot n={c.watch} tone="bg-amber-500" label="watch" />
                          <Dot n={c.offline} tone="bg-slate-400" label="offline" />
                          <Dot n={c.good} tone="bg-emerald-500" label="healthy" />
                        </p>
                      </div>
                      <dl className="grid grid-cols-3 gap-5 text-right">
                        <div>
                          <dt className="text-xs text-slate-500">Invites 7d</dt>
                          <dd className="font-bold tabular-nums text-ink">{c.invites_7d}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Accept 30d</dt>
                          <dd className="font-bold tabular-nums text-ink">{pct(c.accepted_30d, c.invites_30d)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Replies 30d</dt>
                          <dd className="font-bold tabular-nums text-ink">{c.replies_30d}</dd>
                        </div>
                      </dl>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-secondary px-3 py-1.5 text-xs" aria-expanded={open === c.client_id} onClick={() => setOpen(open === c.client_id ? null : c.client_id)}>
                          {open === c.client_id ? 'Close' : 'People'}
                        </button>
                        <Link to={`/team?client=${encodeURIComponent(c.client_id)}`} className="btn-secondary px-3 py-1.5 text-xs">
                          Activity
                        </Link>
                        <Link to={`/agency/report/${encodeURIComponent(c.client_id)}`} className="btn-primary px-3 py-1.5 text-xs">
                          Client report
                        </Link>
                      </div>
                    </div>
                    {open === c.client_id ? <PeoplePanel client={c} onChanged={refresh} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          {agency ? <BrandCard key={agency.agency_id} agency={agency} onSaved={() => void loadAgencies()} /> : null}
        </>
      )}
    </>
  );
}
