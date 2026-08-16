import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { Sidebar } from './components/Sidebar';
import { AuthProvider } from './data/AuthProvider';
import { LeadsProvider } from './data/LeadsProvider';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OutreachPage } from './pages/OutreachPage';
import { SettingsPage } from './pages/SettingsPage';
import { SignUpPage } from './pages/SignUpPage';

function Shell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Fixed sidebar from md up. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 md:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer. */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="relative h-full w-64">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
          >
            Menu
          </button>
          <span className="text-sm font-semibold text-slate-900">LinkedIn outreach</span>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/outreach" element={<OutreachPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public. These are the only routes reachable without a session. */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />

        {/* Everything else. LeadsProvider mounts inside the gate, so no query
            is ever issued before the user is authenticated. */}
        <Route
          path="*"
          element={
            <RequireAuth>
              <LeadsProvider>
                <Shell />
              </LeadsProvider>
            </RequireAuth>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
