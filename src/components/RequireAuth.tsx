import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../data/AuthProvider';
import { LinkAccountPage } from '../pages/LinkAccountPage';

/**
 * The gate. Nothing behind it renders — and, importantly, nothing behind it
 * MOUNTS — until there is a session and a client link. LeadsProvider fetches
 * on mount, so mounting it early would fire queries with no JWT and produce a
 * spurious RLS error before the user has even seen the login form.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <BootScreen />;

  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (status === 'unlinked') return <LinkAccountPage />;

  return <>{children}</>;
}

/** Shown while a persisted session is restored — a skeleton, never a spinner. */
function BootScreen() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-24">
        <div className="card p-6">
          <div className="skeleton h-3 w-32" />
          <div className="skeleton mt-3 h-3 w-48" />
          <div className="skeleton mt-6 h-9 w-full" />
        </div>
      </div>
    </div>
  );
}
