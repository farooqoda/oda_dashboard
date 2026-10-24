import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../data/AuthProvider';
import { useExtensionTask } from '../lib/extensionBridge';
import { firstNameOf, fullNameOf, userInitials } from '../lib/person';
import { useIsManager } from '../lib/team';
import { BrandLogo } from './Brand';
import { Bell } from './Today';
import { ThemeChooser, ThemeToggle } from './ThemeToggle';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/leads', label: 'Find People', end: false },
  { to: '/bulk-leads', label: 'People Search', end: false },
  { to: '/outreach', label: 'Message Studio', end: false },
  { to: '/posts', label: 'Conversations', end: false },
  { to: '/comments', label: 'Comments', end: false },
  { to: '/publish', label: 'Publish', end: false },
  { to: '/prompts', label: 'Prompts', end: false },
  { to: '/analytics', label: 'Analytics', end: false },
];

function ExtensionPill() {
  const { status, recheck } = useExtensionTask();
  const dot = status === 'connected' ? 'bg-good' : status === 'missing' ? 'bg-warning' : 'bg-slate-400';
  const text =
    status === 'connected' ? 'Extension connected' : status === 'missing' ? 'Extension not detected' : 'Checking extension…';
  return (
    <button
      type="button"
      onClick={status === 'missing' ? recheck : undefined}
      title={status === 'missing' ? 'Extension not detected — click to check again' : text}
      className="hidden items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm sm:inline-flex"
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {/* short form on narrower screens so the bar fits on one line */}
      <span className="whitespace-nowrap 2xl:hidden">{status === 'connected' ? 'Connected' : status === 'missing' ? 'Not detected' : 'Checking…'}</span>
      <span className="hidden whitespace-nowrap 2xl:inline">{text}</span>
    </button>
  );
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const full = fullNameOf(user) || firstNameOf(user);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={full ? `Account menu (${full})` : 'Account menu'}
        aria-expanded={open}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white"
      >
        {userInitials(user)}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
          {user?.email ? (
            <div className="px-3 py-2">
              {full ? <p className="truncate text-sm font-semibold text-slate-900">{full}</p> : null}
              <p className="truncate text-xs text-slate-500" title={user.email}>
                {user.email}
              </p>
            </div>
          ) : null}
          <div className="px-3 py-2">
            <p className="mb-1 text-xs text-slate-500">Theme</p>
            <ThemeChooser />
          </div>
          <Link to="/settings" className="block rounded-xl px-3 py-2 text-sm text-slate-800 hover:bg-slate-100">
            Settings
          </Link>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50"
          >
            {signingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMenuOpen(false), [location.pathname]);
  const manager = useIsManager();
  const nav = manager ? [...NAV, { to: '/team', label: 'Team', end: false }] : NAV;

  const pill = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-full px-2.5 py-2 text-sm transition-colors 2xl:px-3.5 ${
      isActive ? 'bg-ink font-semibold text-white shadow-sm' : 'font-medium text-slate-700 hover:bg-sun-50 hover:text-ink'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-canvas/85 shadow-[0_6px_20px_-16px_rgba(14,40,80,0.45)] backdrop-blur-md">
      <div className="mx-auto max-w-[1600px] px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <Link to="/" className="shrink-0" aria-label="Impact Connect home">
          <BrandLogo />
        </Link>

        <nav aria-label="Main" className="mx-auto hidden rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-sm xl:flex">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={pill}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-0">
          <ExtensionPill />
          <ThemeToggle />
          <Bell />
          <button
            type="button"
            className="inline-flex h-11 items-center rounded-full bg-white/70 px-4 text-sm font-medium text-slate-800 xl:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
          <AccountMenu />
        </div>
      </div>

      {menuOpen ? (
        <nav aria-label="Main" className="mt-3 grid grid-cols-2 gap-1 rounded-3xl bg-white/80 p-2 sm:grid-cols-3 xl:hidden">
          {[...nav, { to: '/settings', label: 'Settings', end: false }].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={pill}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
      </div>
    </header>
  );
}
