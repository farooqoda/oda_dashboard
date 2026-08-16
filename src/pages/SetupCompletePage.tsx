import { useEffect, useState } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { CopyButton } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import { fetchLicenseKey, type LicenseKeyOutcome } from '../lib/auth';
import { SUPPORT_EMAIL } from '../lib/constants';
import { supabase } from '../lib/supabase';

/**
 * Shown once, immediately after an invite is redeemed, on both signup paths.
 *
 * The licence key is a credential for the LinkedIn extension, so it is treated
 * as one: shown once, copyable, with an explicit "save it now" warning. It is
 * deliberately NOT surfaced anywhere else in the app.
 */
export function SetupCompletePage() {
  const { user, dismissSetup } = useAuth();
  const [outcome, setOutcome] = useState<LicenseKeyOutcome | null>(null);

  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    void fetchLicenseKey(supabase, user.id).then((result) => {
      if (!cancelled) setOutcome(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <AuthLayout
      title="Setup complete"
      description="Your account is ready. One thing to save before you continue."
    >
      <div className="space-y-5">
        <section>
          <h2 className="text-sm font-semibold text-slate-900">
            Your LinkedIn extension key
          </h2>

          {outcome === null ? (
            <div className="mt-2">
              <div className="skeleton h-10 w-full" />
              <p className="mt-2 text-xs text-slate-500">Generating your key…</p>
            </div>
          ) : outcome.state === 'found' ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
                  {outcome.licenseKey}
                </code>
                <CopyButton text={outcome.licenseKey} className="btn-secondary shrink-0" />
              </div>

              {/* Wording specified by the product owner — kept verbatim. */}
              <p className="mt-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm text-brand-900">
                Paste this as your password when the LinkedIn extension asks you to log in — use
                the same email you just signed up with.
              </p>

              <p className="mt-3 text-xs text-slate-600">
                This is separate from the password you just chose. Your own password still signs
                you in here; this key is only for the extension. Save it now — it is shown once
                and is not repeated anywhere else in the dashboard.
              </p>
            </>
          ) : (
            <UnavailableKey outcome={outcome} email={user?.email ?? null} />
          )}
        </section>

        <button type="button" className="btn-primary w-full" onClick={dismissSetup}>
          Continue to the dashboard
        </button>
      </div>
    </AuthLayout>
  );
}

/**
 * The key could not be read. The account itself is fine and the dashboard
 * works, so this explains the gap rather than blocking the user.
 */
function UnavailableKey({
  outcome,
  email,
}: {
  outcome: Exclude<LicenseKeyOutcome, { state: 'found' }>;
  email: string | null;
}) {
  const reason =
    outcome.state === 'missing'
      ? 'Your key has not been generated yet.'
      : outcome.state === 'empty'
        ? 'Your account record exists, but no key has been set on it.'
        : 'Your key could not be read.';

  return (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="text-sm font-medium text-amber-900">{reason}</p>
      <p className="mt-1 text-xs text-amber-900">
        Your account is set up and the dashboard below will work normally. You only need this key
        for the LinkedIn extension — ask{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2">
          {SUPPORT_EMAIL}
        </a>{' '}
        to send it to you{email ? `, quoting ${email}` : ''}.
      </p>
    </div>
  );
}
