import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { readAuthLink } from './lib/authLink';
import { RequireAuth } from './components/RequireAuth';
import { TopBar } from './components/TopBar';
import { AuthProvider } from './data/AuthProvider';
import { LeadsProvider } from './data/LeadsProvider';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { CommentsPage } from './pages/CommentsPage';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OutreachPage } from './pages/OutreachPage';
import { PromptsPage } from './pages/PromptsPage';
import { BulkLeadsPage } from './pages/BulkLeadsPage';
import { PostsPage } from './pages/PostsPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { SignUpPage } from './pages/SignUpPage';
import { TeamPage } from './pages/TeamPage';

function Shell() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <div>
        <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/outreach" element={<OutreachPage />} />
            <Route path="/posts" element={<PostsPage />} />
            <Route path="/comments" element={<CommentsPage />} />
            <Route path="/prompts" element={<PromptsPage />} />
            <Route path="/bulk-leads" element={<BulkLeadsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

/**
 * Emailed links can land on any address — Supabase falls back to the Site URL
 * whenever the requested one is not on its allow-list. Once, on first load,
 * send a reset link to the new-password form and a failed link to sign-in
 * with an explanation, instead of letting the normal gate swallow it.
 */
function EmailLinkRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (location.pathname === '/reset-password') return; // that page handles its own link
    const link = readAuthLink();
    if (link.isRecovery) navigate('/reset-password', { replace: true });
    else if (link.errorCode) navigate('/login', { replace: true, state: { linkError: link.errorCode } });
  }, [location.pathname, navigate]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <EmailLinkRedirect />
      <Routes>
        {/* Public. These are the only routes reachable without a session.
            /reset-password is here, not behind RequireAuth, on purpose: the
            recovery link itself signs the browser in, and routing it through
            the normal gate would resolve that as an ordinary sign-in and
            drop an already-linked user straight onto the dashboard instead
            of showing the new-password form — see ResetPasswordPage.tsx. */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

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
