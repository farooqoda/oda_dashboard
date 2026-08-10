import { useCallback, useEffect, useRef, useState } from 'react';
import { useLeads } from '../../data/LeadsProvider';
import { PIPELINE_STAGES } from '../../lib/constants';
import { displayName, stageOf, stagePillClass } from '../../lib/format';
import { fitScore, odaBucket, personalityType } from '../../lib/traitsRegistry';
import type { FriendlyError } from '../../lib/supabase';
import type { LeadPatch } from '../../lib/types';
import { Avatar, FitBadge, InlineError, TypePill } from '../ui';
import { ActivityTab } from './ActivityTab';
import { OutreachTab } from './OutreachTab';
import { ProfileTab } from './ProfileTab';
import { PsychographicsTab } from './PsychographicsTab';

const TABS = ['Profile', 'Psychographics', 'Outreach', 'Activity'] as const;
type Tab = (typeof TABS)[number];

export function LeadModal({ leadId, onClose }: { leadId: number | null; onClose: () => void }) {
  const { leads, updateLead } = useLeads();
  const [tab, setTab] = useState<Tab>('Profile');
  const [saveError, setSaveError] = useState<FriendlyError | null>(null);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const lead = leads.find((l) => l.id === leadId) ?? null;

  // Reset per-lead UI state whenever a different lead is opened.
  useEffect(() => {
    setTab('Profile');
    setSaveError(null);
  }, [leadId]);

  useEffect(() => {
    if (leadId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [leadId, onClose]);

  const patch = useCallback(
    async (next: LeadPatch) => {
      if (!lead) return;
      setSaving(true);
      setSaveError(null);
      const error = await updateLead(lead.id, next);
      if (error) setSaveError(error);
      setSaving(false);
    },
    [lead, updateLead],
  );

  if (leadId === null) return null;

  if (!lead) {
    // The row vanished from the loaded set (e.g. a refresh dropped it).
    return (
      <Shell onClose={onClose} closeRef={closeRef}>
        <div className="p-8 text-center">
          <p className="text-sm text-slate-700">This lead is no longer in the loaded set.</p>
          <button type="button" className="btn-secondary mt-4" onClick={onClose}>
            Close
          </button>
        </div>
      </Shell>
    );
  }

  const stage = stageOf(lead);
  const score = fitScore(lead.traits);
  const type = personalityType(lead.traits);
  const bucket = odaBucket(lead.traits);
  const name = displayName(lead);
  const subtitleParts = [lead.title?.trim(), lead.company?.trim()].filter(Boolean) as string[];

  return (
    <Shell onClose={onClose} closeRef={closeRef} labelledBy="lead-modal-title">
      <header className="border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-4">
          <Avatar name={name} size="lg" />

          <div className="min-w-0 flex-1">
            <h2 id="lead-modal-title" className="truncate text-lg font-semibold text-slate-900">
              {name}
            </h2>
            <p className="mt-0.5 break-words text-sm text-slate-600">
              {subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'No title or company recorded'}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="stage-select">
                Stage
              </label>
              <select
                id="stage-select"
                value={stage}
                disabled={saving}
                onChange={(e) => void patch({ stage: e.target.value })}
                className={`pill cursor-pointer appearance-none pr-6 ${stagePillClass(stage)}`}
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%23475569' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E\")",
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 4px center',
                  backgroundSize: '12px 12px',
                }}
              >
                {(PIPELINE_STAGES as readonly string[]).includes(stage) ? null : (
                  <option value={stage}>{stage}</option>
                )}
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <FitBadge score={score} emptyLabel="No fit score" />
              <TypePill type={type} />
              {bucket ? <span className="pill border-slate-200 bg-slate-50 text-slate-700">{bucket}</span> : null}

              {lead.linkedin_url ? (
                <a
                  href={lead.linkedin_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
                >
                  Open LinkedIn profile
                </a>
              ) : (
                <span className="text-xs italic text-slate-400">No LinkedIn URL</span>
              )}
            </div>
          </div>

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-ghost shrink-0"
            aria-label="Close lead details"
          >
            Close
          </button>
        </div>

        {saveError ? (
          <div className="mt-3">
            <InlineError error={saveError} />
          </div>
        ) : null}

        <nav className="-mb-4 mt-4 flex gap-1 overflow-x-auto" aria-label="Lead sections">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-brand-600 text-brand-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        {tab === 'Profile' ? <ProfileTab lead={lead} /> : null}
        {tab === 'Psychographics' ? <PsychographicsTab lead={lead} /> : null}
        {tab === 'Outreach' ? (
          <OutreachTab lead={lead} saving={saving} onPatch={(p) => void patch(p)} />
        ) : null}
        {tab === 'Activity' ? <ActivityTab lead={lead} /> : null}
      </div>
    </Shell>
  );
}

function Shell({
  children,
  onClose,
  closeRef,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement>;
  labelledBy?: string;
}) {
  void closeRef;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-0 sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative flex max-h-full w-full flex-col overflow-hidden rounded-none border border-slate-200 bg-white sm:max-h-[calc(100vh-3rem)] sm:max-w-4xl sm:rounded-card"
      >
        {children}
      </div>
    </div>
  );
}
