import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../data/AuthProvider';
import { useLeads } from '../data/LeadsProvider';
import { outreachQueue, repliedCount } from '../lib/selectors';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/leads', label: 'Leads', end: false },
  { to: '/outreach', label: 'Outreach', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

function Count({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      {loading ? (
        <span className="skeleton h-3 w-8" />
      ) : (
        <span className="text-xs font-semibold tabular-nums text-slate-800">
          {value.toLocaleString()}
        </span>
      )}
    </div>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { leads, loading } = useLeads();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const pending = outreachQueue(leads).length;
  const replied = repliedCount(leads);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    // No reset on success: signing out unmounts this component via the guard.
  };

  return (
    <div className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-sm font-semibold text-slate-900">LinkedIn outreach</p>
        <p className="mt-0.5 text-xs text-slate-500">Ontario Digital Academy</p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-800'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-200 px-5 py-4">
        <Count label="Total leads" value={leads.length} loading={loading} />
        <Count label="Pending outreach" value={pending} loading={loading} />
        <Count label="Replied or further" value={replied} loading={loading} />
      </div>

      <div className="border-t border-slate-200 px-5 py-3">
        {user?.email ? (
          <p className="truncate text-xs text-slate-600" title={user.email}>
            {user.email}
          </p>
        ) : null}
        <button
          type="button"
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Log out'}
        </button>
      </div>
    </div>
  );
}
