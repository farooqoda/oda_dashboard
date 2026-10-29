import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, InlineError, PageHeader, SkeletonTable } from '../components/ui';
import {
  defaultProfileName,
  download,
  launchAccounts,
  loadBox,
  loadSharedProxies,
  macLauncher,
  saveBox,
  windowsLauncher,
  type BoxRow,
} from '../lib/agency';
import type { FriendlyError } from '../lib/supabase';

type Draft = { profile_name: string; proxy_scheme: string; proxy_host: string; proxy_port: string; country: string; note: string };
const toDraft = (r: BoxRow): Draft => ({
  profile_name: r.profile_name ?? defaultProfileName(r),
  proxy_scheme: r.proxy_scheme ?? 'http',
  proxy_host: r.proxy_host ?? '',
  proxy_port: r.proxy_port ? String(r.proxy_port) : '',
  country: r.country ?? '',
  note: r.note ?? '',
});

/** Lets people paste "host:port" or a full "socks5://host:port" into the host box. */
function splitPasted(d: Draft): Draft {
  const m = d.proxy_host.trim().match(/^(?:(https?|socks5h?):\/\/)?([A-Za-z0-9.-]+):(\d{1,5})\/?$/);
  if (!m) return d;
  return { ...d, proxy_scheme: m[1] ? m[1].replace('socks5h', 'socks5') : d.proxy_scheme, proxy_host: m[2], proxy_port: m[3] };
}

function Row({ r, onSaved }: { r: BoxRow; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(r));
  const [error, setError] = useState<FriendlyError | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(r));
  const hasCreds = /@|^[a-z0-9]+:\/\/[^/]*:[^/]*@/i.test(d.proxy_host);
  return (
    <tr className="border-b border-slate-100 align-top last:border-0">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{r.email ?? r.user_id}</p>
        <p className="text-xs text-slate-500">
          {r.client_name}
          {r.ext_seen_at ? ` · extension seen ${new Date(r.ext_seen_at).toLocaleDateString()}` : ' · extension not seen yet'}
          {r.work_tz ? ` · ${r.work_tz}` : ''}
        </p>
      </td>
      <td className="px-2 py-3">
        <input className="input w-48 py-1.5 text-sm" aria-label="Chrome profile name" value={d.profile_name} maxLength={40} onChange={(e) => setD({ ...d, profile_name: e.target.value })} />
      </td>
      <td className="px-2 py-3">
        <div className="flex gap-1">
          <select className="input w-24 py-1.5 text-sm" aria-label="Proxy type" value={d.proxy_scheme} onChange={(e) => setD({ ...d, proxy_scheme: e.target.value })}>
            <option value="http">http</option>
            <option value="https">https</option>
            <option value="socks5">socks5</option>
          </select>
          <input
            className="input w-44 py-1.5 text-sm"
            aria-label="Proxy host"
            placeholder="203.0.113.7"
            value={d.proxy_host}
            onChange={(e) => setD({ ...d, proxy_host: e.target.value })}
            onBlur={() => setD((x) => splitPasted(x))}
          />
          <input
            className="input w-20 py-1.5 text-sm"
            aria-label="Proxy port"
            placeholder="port"
            inputMode="numeric"
            value={d.proxy_port}
            onChange={(e) => setD({ ...d, proxy_port: e.target.value.replace(/\D/g, '').slice(0, 5) })}
          />
        </div>
        {hasCreds ? <p className="mt-1 text-xs text-rose-700">Don’t put a username or password here — use IP allow-listing at your proxy provider.</p> : null}
      </td>
      <td className="px-2 py-3">
        <input className="input w-28 py-1.5 text-sm" aria-label="Country" placeholder="UAE" value={d.country} maxLength={40} onChange={(e) => setD({ ...d, country: e.target.value })} />
      </td>
      <td className="px-2 py-3">
        <input className="input w-40 py-1.5 text-sm" aria-label="Note" placeholder="provider / renews" value={d.note} maxLength={200} onChange={(e) => setD({ ...d, note: e.target.value })} />
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          className="btn-primary px-3 py-1.5 text-xs"
          disabled={!dirty || busy || hasCreds}
          onClick={async () => {
            setBusy(true);
            const x = splitPasted(d);
            const res = await saveBox({
              user_id: r.user_id,
              profile_name: x.profile_name,
              proxy_scheme: x.proxy_scheme,
              proxy_host: x.proxy_host.trim(),
              proxy_port: x.proxy_port ? Number(x.proxy_port) : null,
              country: x.country,
              note: x.note,
            });
            setBusy(false);
            if (res.error) {
              setError(res.error);
              setOk(false);
            } else {
              setError(null);
              setOk(true);
              onSaved();
            }
          }}
        >
          Save
        </button>
        {ok && !dirty ? <p className="mt-1 text-xs text-emerald-700">Saved</p> : null}
        {error ? (
          <div className="mt-1 max-w-[220px] text-left">
            <InlineError error={error} />
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function AgencyBoxPage() {
  const [rows, setRows] = useState<BoxRow[] | null>(null);
  const [shared, setShared] = useState<{ proxy: string; accounts: number; emails: string }[]>([]);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [missing, setMissing] = useState(false);
  const [client, setClient] = useState('');

  const load = useCallback(async () => {
    const [b, s] = await Promise.all([loadBox(null), loadSharedProxies()]);
    if (b.error) {
      setMissing(!!b.missing);
      return setError(b.error);
    }
    setError(null);
    setRows(b.data ?? []);
    setShared(s.data ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const clients = useMemo(() => [...new Map((rows ?? []).map((r) => [r.client_id, r.client_name])).entries()], [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => !client || r.client_id === client), [rows, client]);
  const withProxy = shown.filter((r) => r.proxy_host).length;
  const suffix = client ? '-' + client.replace(/[^a-z0-9_-]/gi, '') : '';

  return (
    <>
      <PageHeader
        title="Agency Box"
        description="Run many LinkedIn accounts from one computer safely: each account gets its own Chrome profile and its own fixed proxy, so LinkedIn sees each person on their own steady connection."
        actions={
          <Link to="/agency" className="btn-secondary">
            ← Agency
          </Link>
        }
      />
      {missing ? (
        <EmptyState title="One database step is missing">Run the “Agency Box” SQL (i4) in Supabase, then refresh.</EmptyState>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : !rows ? (
        <SkeletonTable rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState title="No accounts yet">Invite people into a client workspace first; their accounts appear here.</EmptyState>
      ) : (
        <>
          <section className="card mb-6 p-5" aria-label="How it works">
            <h2 className="mb-2 text-base font-semibold text-slate-900">How it works</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>
                Buy one <b>static (ISP or residential) proxy per LinkedIn account</b>, in the country the person normally works from. In the proxy provider, turn on{' '}
                <b>IP allow-listing</b> (“authorize my IP”) for this computer — then no password is needed.
              </li>
              <li>Fill in each account’s proxy below and press Save. Never share one proxy between two accounts.</li>
              <li>
                Download the launcher for this computer and open it. Choose an account: Chrome opens <b>in that account’s own profile</b> with LinkedIn and an IP check page
                (it should show the proxy’s country).
              </li>
              <li>
                The first time only, in each profile: install the Impact Connect extension from the Chrome Web Store, sign in to LinkedIn and to the extension with that
                person’s email and licence key.
              </li>
              <li>Always open these accounts with the launcher — opening the profile another way skips the proxy.</li>
            </ol>
          </section>

          {shared.length ? (
            <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200" role="alert">
              <b>Same proxy on more than one account:</b>{' '}
              {shared.map((s) => `${s.proxy} (${s.emails})`).join('; ')}. Give each account its own proxy.
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {clients.length > 1 ? (
              <select className="input w-60 py-1.5 text-sm" aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">All clients ({clients.length})</option>
                {clients.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="text-sm text-slate-600">
              {withProxy} of {shown.length} accounts have a proxy
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => download(`impact-connect-box${suffix}.bat`, windowsLauncher(launchAccounts(shown)), 'application/octet-stream')}
              >
                Download for Windows (.bat)
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => download(`impact-connect-box${suffix}.command`, macLauncher(launchAccounts(shown)), 'application/octet-stream')}
              >
                Download for Mac (.command)
              </button>
            </span>
          </div>

          <section className="card" aria-label="Accounts">
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-2 py-3 font-medium">Chrome profile</th>
                    <th className="px-2 py-3 font-medium">Proxy (type, host, port)</th>
                    <th className="px-2 py-3 font-medium">Country</th>
                    <th className="px-2 py-3 font-medium">Note</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Save</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <Row key={r.user_id} r={r} onSaved={() => void load()} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="mt-3 text-xs text-slate-500">
            Mac: the first time, open Terminal and run <code className="rounded bg-slate-100 px-1">bash ~/Downloads/impact-connect-box{suffix}.command</code> (or right-click → Open).
            Windows may warn about a downloaded .bat — choose “More info → Run anyway”. Download the launcher again after you change a proxy.
          </p>
        </>
      )}
    </>
  );
}
