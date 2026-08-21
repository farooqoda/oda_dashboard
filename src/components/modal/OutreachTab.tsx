import { useCallback, useEffect, useRef, useState } from 'react';
import { useLeads } from '../../data/LeadsProvider';
import { useAuth } from '../../data/AuthProvider';
import { CONNECTION_STATUSES, INVITE_CHAR_LIMIT, REVIEW_STATUSES } from '../../lib/constants';
import { requestReplyDraft } from '../../lib/draftReply';
import { traitBool, traitString } from '../../lib/traitsRegistry';
import type { FriendlyError } from '../../lib/supabase';
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

/**
 * CONVERSATION HISTORY AND THE DRAFTED REPLY
 * ==========================================
 * The user pastes the LinkedIn thread here, because LinkedIn cannot be read
 * from this app. The text is kept on `gab_leads.conversation_history` so it
 * survives closing the modal, and the drafted reply is kept on
 * `gab_leads.reply_draft` so a draft made yesterday is still here today.
 *
 * Typing is never thrown away: the textarea saves on blur, there is an
 * explicit Save for people who prefer one, and drafting saves first. A
 * remote change to the row only overwrites the box when the user has no
 * unsaved edits in it.
 */
function ConversationSection({ lead }: { lead: Lead }) {
  const { updateLead } = useLeads();
  const { clientId } = useAuth();

  const [text, setText] = useState(lead.conversation_history ?? '');
  /** The value currently believed to be in the database. */
  const savedRef = useRef(lead.conversation_history ?? '');
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<FriendlyError | null>(null);

  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<FriendlyError | null>(null);
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  // A different lead: start over from that row's stored values.
  useEffect(() => {
    setText(lead.conversation_history ?? '');
    savedRef.current = lead.conversation_history ?? '';
    savingRef.current = false;
    setSaving(false);
    setSaveError(null);
    setDrafting(false);
    setDraftError(null);
    setDraftWarning(null);
    setFresh(null);
  }, [lead.id]);

  // The row changed underneath us (another tab, or the drafting workflow
  // writing back). Adopt it only if there is nothing unsaved to lose.
  //
  // A save in flight is skipped entirely: `updateLead` is optimistic, so the
  // row swings to the new value and — if the write fails — back again, and
  // following it here would rewrite the textarea from under the user and lose
  // the very text the save was trying to keep.
  useEffect(() => {
    if (savingRef.current) return;
    const incoming = lead.conversation_history ?? '';
    if (incoming === savedRef.current) return;
    const clean = text === savedRef.current;
    savedRef.current = incoming;
    if (clean) setText(incoming);
  }, [lead.conversation_history, text]);

  const dirty = text !== savedRef.current;

  const persist = useCallback(
    async (value: string): Promise<boolean> => {
      if (value === savedRef.current) return true;
      savingRef.current = true;
      setSaving(true);
      setSaveError(null);
      const error = await updateLead(lead.id, { conversation_history: value.trim() ? value : null });
      // Only after the write is settled: on failure the row has been rolled
      // back, so what is stored is still whatever was there before.
      savedRef.current = error ? savedRef.current : value;
      savingRef.current = false;
      setSaving(false);
      if (error) {
        setSaveError(error);
        return false;
      }
      return true;
    },
    [lead.id, updateLead],
  );

  const draftReply = async () => {
    const conversation = text.trim();
    setDraftError(null);
    setDraftWarning(null);

    if (!conversation) {
      setDraftError({
        message: 'Paste the conversation first.',
        hint: 'The draft is written from what both sides have already said.',
        code: 'NO_CONVERSATION',
      });
      return;
    }

    setDrafting(true);
    // Save before calling out, so a failed or slow draft never costs the text.
    await persist(text);

    const { reply, error } = await requestReplyDraft({
      leadId: lead.id,
      clientId: clientId ?? lead.client_id,
      conversationText: conversation,
    });

    if (error || !reply) {
      setDraftError(
        error ?? { message: 'The drafting service sent no reply back.', hint: null, code: 'DRAFT_REPLY' },
      );
      setDrafting(false);
      return;
    }

    setFresh(reply);

    // Keep it on the row. The workflow may write this itself; setting it here
    // too means the draft is still on screen next session either way.
    const writeError = await updateLead(lead.id, { reply_draft: reply });
    if (writeError) {
      setDraftWarning(
        `The draft below could not be saved to this lead — copy it now if you want to keep it. ${writeError.message}`,
      );
    }
    setDrafting(false);
  };

  const stored = lead.reply_draft?.trim() ?? '';
  const shown = fresh ?? (stored || null);

  return (
    <section className="border-t border-slate-200 pt-5">
      <h3 className="text-sm font-semibold text-slate-900">Conversation and reply</h3>
      <p className="mt-1 text-xs text-slate-600">
        This dashboard cannot read LinkedIn. Paste the thread here and a reply is drafted from
        it — you still send it yourself.
      </p>

      <label className="mt-4 block">
        <span className="label">Paste the LinkedIn conversation (both sides)</span>
        <textarea
          className="input mt-1 min-h-[9rem] font-normal"
          value={text}
          placeholder={'Them: Thanks for connecting…\nYou: Glad to be connected…'}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void persist(text)}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void persist(text)}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </button>

        <button
          type="button"
          className="btn-primary"
          onClick={() => void draftReply()}
          disabled={drafting || !text.trim()}
        >
          {drafting ? 'Drafting…' : 'Draft Reply'}
        </button>

        <span className="text-xs text-slate-500">
          {dirty ? 'Unsaved changes — saved when you click away.' : 'Saved to this lead.'}
        </span>
      </div>

      {saveError ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          <p className="font-medium">The conversation could not be saved.</p>
          <p className="mt-1 break-words font-mono">{saveError.message}</p>
          {saveError.hint ? <p className="mt-1">{saveError.hint}</p> : null}
        </div>
      ) : null}

      {draftError ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          <p className="font-medium">{draftError.message}</p>
          {draftError.hint ? <p className="mt-1 break-words">{draftError.hint}</p> : null}
        </div>
      ) : null}

      {draftWarning ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {draftWarning}
        </div>
      ) : null}

      <div className="mt-4">
        {drafting && !shown ? (
          <div className="card p-4">
            <div className="skeleton h-3 w-40" />
            <div className="skeleton mt-3 h-3 w-full" />
            <div className="skeleton mt-2 h-3 w-5/6" />
          </div>
        ) : shown ? (
          <MessageCard
            title="Drafted reply"
            subtitle={
              fresh
                ? 'Drafted just now from the conversation above.'
                : 'Drafted earlier and saved to this lead.'
            }
            body={shown}
          />
        ) : (
          <p className="rounded-md border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-500">
            No reply has been drafted for this lead yet.
          </p>
        )}
      </div>
    </section>
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

  const hasAnyMessage = !!invite || !!inmailMessage || !!replyDraft || !!lead.reply_draft?.trim();

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

      <ConversationSection lead={lead} />

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
