import { useMemo, useState } from 'react';
import { LeadModal } from '../components/modal/LeadModal';
import {
  Avatar,
  CopyButton,
  EmptyState,
  ErrorState,
  InlineError,
  PageHeader,
  SkeletonCards,
  StagePill,
  TypePill,
} from '../components/ui';
import { useLeads } from '../data/LeadsProvider';
import { INVITE_CHAR_LIMIT } from '../lib/constants';
import { displayName, stageOf } from '../lib/format';
import { outreachQueue } from '../lib/selectors';
import { personalityType } from '../lib/traitsRegistry';
import type { FriendlyError } from '../lib/supabase';

export function OutreachPage() {
  const { leads, loading, error, refresh, refreshing, updateLead } = useLeads();
  const [openId, setOpenId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<FriendlyError | null>(null);

  const queue = useMemo(() => outreachQueue(leads), [leads]);

  const markContacted = async (id: number) => {
    setSavingId(id);
    setSaveError(null);
    const err = await updateLead(id, { stage: 'Contacted' });
    if (err) setSaveError(err);
    setSavingId(null);
  };

  if (error) {
    return (
      <>
        <PageHeader title="Outreach" />
        <ErrorState error={error} onRetry={refresh} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Outreach"
        description="Leads that have a connection invite drafted and are still at New Lead. Copy the message, send it yourself in LinkedIn, then mark the lead as contacted."
        actions={
          <button type="button" className="btn-secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <p className="mb-4 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
        This app never sends messages. Sending is manual, in LinkedIn — "Mark as contacted" only
        moves the lead to the Contacted stage in the database.
      </p>

      {saveError ? (
        <div className="mb-4">
          <InlineError error={saveError} />
        </div>
      ) : null}

      {loading ? (
        <SkeletonCards count={4} />
      ) : queue.length === 0 ? (
        <EmptyState title="Nothing is queued for outreach">
          {leads.length === 0
            ? 'No leads are loaded at all, so there is nothing to send. Check that gab_leads has rows and that Row Level Security exposes them.'
            : 'Every loaded lead either has no invite_message drafted, or has already moved past the New Lead stage. Invite messages are written by the profiling pipeline, not here.'}
        </EmptyState>
      ) : (
        <div className={`space-y-4 ${refreshing ? 'is-refreshing' : ''}`}>
          <p className="text-xs text-slate-600">
            {queue.length.toLocaleString()} {queue.length === 1 ? 'lead' : 'leads'} waiting.
          </p>

          {queue.map((lead) => {
            const message = lead.invite_message?.trim() ?? '';
            const over = message.length > INVITE_CHAR_LIMIT;
            return (
              <article key={lead.id} className="card p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="flex min-w-0 items-start gap-3 lg:w-64 lg:shrink-0">
                    <Avatar name={displayName(lead)} size="md" />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setOpenId(lead.id)}
                        className="block max-w-full truncate text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
                        title={displayName(lead)}
                      >
                        {displayName(lead)}
                      </button>
                      <p className="truncate text-xs text-slate-600" title={lead.company ?? undefined}>
                        {lead.company?.trim() || 'No company recorded'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <TypePill type={personalityType(lead.traits)} />
                        <StagePill stage={stageOf(lead)} />
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                        {message}
                      </p>
                    </div>
                    <p
                      className={`mt-2 text-xs tabular-nums ${
                        over ? 'font-medium text-red-700' : 'text-slate-500'
                      }`}
                    >
                      {message.length.toLocaleString()} / {INVITE_CHAR_LIMIT} characters
                      {over ? ' — over the LinkedIn limit, trim before sending' : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
                    <CopyButton text={message} label="Copy message" />
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={savingId === lead.id}
                      onClick={() => void markContacted(lead.id)}
                    >
                      {savingId === lead.id ? 'Saving…' : 'Mark as contacted'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setOpenId(lead.id)}
                    >
                      Open details
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <LeadModal leadId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
