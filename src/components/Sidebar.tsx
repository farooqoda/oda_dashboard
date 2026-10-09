import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../data/AuthProvider';
import { useLeads } from '../data/LeadsProvider';
import { outreachQueue, repliedCount } from '../lib/selectors';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/leads', label: 'Leads', end: false },
  { to: '/bulk-leads', label: 'Bulk Leads', end: false },
  { to: '/outreach', label: 'Outreach', end: false },
  { to: '/posts', label: 'Posts', end: false },
  { to: '/comments', label: 'Comments', end: false },
  { to: '/prompts', label: 'Prompts', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

function Count({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-ink-300">{label}</span>
      {loading ? (
        <span className="h-3 w-8 animate-pulse rounded bg-white/15" />
      ) : (
        <span className="text-sm font-semibold tabular-nums text-white">
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
    <div className="flex h-full flex-col bg-ink text-ink-200">
      <div className="px-5 pb-5 pt-6">
        <p className="brand-title text-[1.85rem]">
          LinkedIn
          <br />
          Outreach
        </p>
        <p className="mt-2 text-xs font-medium text-ink-300">Ontario Digital Academy</p>
      </div>

      <nav className="flex-1 space-y-0.5 border-t border-white/10 px-3 py-4">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `block rounded-md border-l-[3px] px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-offset-ink ${
                isActive
                  ? 'border-sun-500 bg-white/10 text-white'
                  : 'border-transparent text-ink-200 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-white/10 px-5 py-4">
        <Count label="Total leads" value={leads.length} loading={loading} />
        <Count label="Pending outreach" value={pending} loading={loading} />
        <Count label="Replied or further" value={replied} loading={loading} />
      </div>

      <div className="border-t border-white/10 px-5 py-3">
        {user?.email ? (
          <p className="truncate text-xs text-ink-300" title={user.email}>
            {user.email}
          </p>
        ) : null}
        <button
          type="button"
          className="mt-2 w-full rounded-md border border-white/25 bg-transparent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Log out'}
        </button>
      </div>
    </div>
  );
}
