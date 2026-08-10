import { CONNECTION_STATUSES, INVITE_CHAR_LIMIT, REVIEW_STATUSES } from '../../lib/constants';
import { traitBool, traitString } from '../../lib/traitsRegistry';
import type { Lead, LeadPatch } from '../../lib/types';
import { CopyButton } from '../ui';

/** Frameworks have used several names for the drafted reply. */
const REPLY_KEYS = [
  'reply_draft',
  'draft_reply',
  'suggested_reply',
  'recommended_reply',
  'reply_message',
  'linkedin_reply_message',
];

function firstTrait(lead: Lead, keys: string[]): string | null {
  for (const key of keys) {
    const value = traitString(lead.traits, key);
    if (value) return value;
  }
  return null;
}

function MessageCard({
  title,
  subtitle,
  body,
  limit,
}: {
  title: string;
  subtitle?: string | null;
  body: string;
  limit?: number;
}) {
  const count = body.length;
  const over = limit !== undefined && count > limit;

  return (
    <div className="card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="mt-0.5 break-words text-xs text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`text-xs tabular-nums ${over ? 'font-medium text-red-700' : 'text-slate-500'}`}
          >
            {count.toLocaleString()}
            {limit !== undefined ? ` / ${limit}` : ''} characters
          </span>
          <CopyButton text={body} />
        </div>
      </header>
      <div className="p-4">
        {over ? (
          <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            This is {count - limit!} characters over the LinkedIn connection-note limit. Trim it
            before sending.
          </p>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
          {body}
        </p>
      </div>
    </div>
  );
}

function StatusSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const current = value?.trim() ?? '';
  // Preserve whatever the row already holds, even if it is not one of ours.
  const all = current && !options.includes(current) ? [current, ...options] : options;

  return (
    <label className="block">
      <span className="label">{label}</span>
      <select
        className="input mt-1"
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {!current ? <option value="">Not set</option> : null}
        {all.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OutreachTab({
  lead,
  onPatch,
  saving,
}: {
  lead: Lead;
  onPatch: (patch: LeadPatch) => void;
  saving: boolean;
}) {
  const invite = lead.invite_message?.trim() ?? '';
  const inmailSubject = traitString(lead.traits, 'linkedin_inmail_subject');
  const inmailMessage = traitString(lead.traits, 'linkedin_inmail_message');
  const replyDraft = firstTrait(lead, REPLY_KEYS);
  const responseNeeded = traitBool(lead.traits, 'response_needed');
  const responseReason = traitString(lead.traits, 'response_reason');

  const hasAnyMessage = !!invite || !!inmailMessage || !!replyDraft;

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        Messages are drafted by the profiling pipeline and sent by you, by hand, in LinkedIn. This
        dashboard never sends anything.
      </p>

      {!hasAnyMessage ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-medium text-slate-800">No messages have been generated yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Neither an invite message nor an InMail draft exists on this row. Message generation
            happens in the database pipeline.
          </p>
        </div>
      ) : null}

      {invite ? (
        <MessageCard title="Connection invite" body={invite} limit={INVITE_CHAR_LIMIT} />
      ) : null}

      {inmailMessage ? (
        <MessageCard
          title="InMail"
          subtitle={inmailSubject ? `Subject: ${inmailSubject}` : 'No subject line was generated'}
          body={inmailMessage}
        />
      ) : null}

      {replyDraft ? (
        <MessageCard title="Reply draft" body={replyDraft} />
      ) : responseNeeded === false ? (
        // Explicitly told no reply is needed — show the reasoning instead of an
        // empty box that looks like something failed.
        <div className="card border-slate-200 bg-slate-50">
          <div className="px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">No reply drafted</h3>
            <p className="mt-1 text-sm text-slate-700">
              {responseReason ??
                'The profiling step marked this lead as not needing a response, without recording a reason.'}
            </p>
          </div>
        </div>
      ) : null}

      <section className="border-t border-slate-200 pt-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Status</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatusSelect
            label="Connection status"
            value={lead.connection_status}
            options={CONNECTION_STATUSES}
            disabled={saving}
            onChange={(next) => onPatch({ connection_status: next })}
          />
          <StatusSelect
            label="Review status"
            value={lead.review_status}
            options={REVIEW_STATUSES}
            disabled={saving}
            onChange={(next) => onPatch({ review_status: next })}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Both write straight back to gab_leads.
        </p>
      </section>
    </div>
  );
}
