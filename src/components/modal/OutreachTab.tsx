import { useCallback, useEffect, useRef, useState } from 'react';
import { useLeads } from '../../data/LeadsProvider';
import { useAuth } from '../../data/AuthProvider';
import { CONNECTION_STATUSES, INVITE_CHAR_LIMIT, REVIEW_STATUSES } from '../../lib/constants';
import { requestReplyDraft } from '../../lib/draftReply';
import { prettifyKey, traitBool, traitString } from '../../lib/traitsRegistry';
import type { FriendlyError } from '../../lib/supabase';
import type { Lead, LeadPatch } from '../../lib/types';
import { DetailedAnalysis, hasDetailedAnalysis } from '../DetailedAnalysis';
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

/**
 * A message may live in a real column on gab_leads OR inside the `traits`
 * jsonb, depending on which pipeline wrote the row — `select('*')` returns
 * whatever columns exist, so both are checked here. Column first, traits
 * second, so an InMail or a reply draft renders for EVERY lead that has one,
 * wherever it was written.
 */
function columnString(lead: Lead, key: string): string | null {
  const value = (lead as unknown as Record<string, unknown>)[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function messageText(lead: Lead, key: string): string | null {
  return columnString(lead, key) ?? traitString(lead.traits, key);
}

// ---------------------------------------------------------------------------
// Finding the messages
// ---------------------------------------------------------------------------
//
// The three cards above read fixed key names, and that is exactly why a lead
// could sit here saying "no messages have been generated" while the pipeline
// had written one under a name this file did not know. Frameworks are added in
// the database without anyone touching this app — the same premise the traits
// registry is built on — so the tab must not depend on guessing their key
// names right.
//
// Anything else on the row that looks like a generated message is therefore
// discovered rather than declared, from the columns AND from `traits`, and
// rendered in the same card as the rest.

/** Row fields that are never an outreach message, whatever they are called. */
const NOT_A_MESSAGE = new Set([
  'id',
  'client_id',
  'user_id',
  'contact_id',
  'linkedin_url',
  'full_name',
  'title',
  'company',
  'email',
  'phone',
  'location',
  'stage',
  'connection_status',
  'review_status',
  'created_at',
  'updated_at',
  'traits',
  // The user's own pasted thread, which has its own box, and the raw profile
  // scrape, which is prose about the person rather than a message to them.
  'conversation_history',
  'profile_text',
]);

/** A key that names a message rather than an attribute. */
const MESSAGE_NAME = /message|inmail|invite|outreach|reply|draft|note|pitch|blurb|copy$/i;

interface FoundMessage {
  key: string;
  label: string;
  subject: string | null;
  body: string;
  limit?: number;
}

/** `linkedin_inmail_message` -> the value of `linkedin_inmail_subject`, if any. */
function siblingSubject(lead: Lead, key: string): string | null {
  const stem = key.replace(/_?(message|body|text|draft|copy)$/i, '');
  if (!stem || stem === key) return null;
  return messageText(lead, `${stem}_subject`);
}

/**
 * Every message-shaped value on the row that is not already on screen.
 * Columns first, then traits; identical bodies are shown once, because a
 * pipeline that writes to both would otherwise render the message twice.
 */
function discoverMessages(lead: Lead, shownKeys: Set<string>, shownBodies: Set<string>): FoundMessage[] {
  const fields: Array<[string, unknown]> = [
    ...Object.entries(lead as unknown as Record<string, unknown>),
    ...Object.entries(lead.traits ?? {}),
  ];

  const seen = new Set(shownBodies);
  const found: FoundMessage[] = [];

  for (const [key, value] of fields) {
    if (shownKeys.has(key) || NOT_A_MESSAGE.has(key)) continue;
    if (typeof value !== 'string') continue;
    // A subject line is a subtitle on its message, never a card of its own.
    if (/subject$/i.test(key)) continue;
    if (!MESSAGE_NAME.test(key)) continue;

    const body = value.trim();
    if (!body || seen.has(body)) continue;
    seen.add(body);

    found.push({
      key,
      label: prettifyKey(key),
      subject: siblingSubject(lead, key),
      body,
      // Anything sent as a connection note is bound by the same 300 characters.
      limit: /invite|connection/i.test(key) ? INVITE_CHAR_LIMIT : undefined,
    });
  }

  return found;
}

/**
 * What the row actually carries, for when nothing message-shaped was found.
 * Names and sizes only, never values: enough to see where a message landed —
 * or that it never arrived — without printing someone's profile into the page.
 */
function describeRow(lead: Lead): string[] {
  const describe = (entries: Array<[string, unknown]>) =>
    entries
      .filter(([key, value]) => !NOT_A_MESSAGE.has(key) && value !== null && value !== undefined && value !== '')
      .map(([key, value]) =>
        typeof value === 'string' ? `${key} (${value.trim().length} chars)` : `${key} (${typeof value})`,
      );

  return [
    ...describe(Object.entries(lead as unknown as Record<string, unknown>)),
    ...describe(Object.entries(lead.traits ?? {})),
  ].sort();
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
 * THE REPLY SECTION
 * =================
 * This is the reply-draft area that has always been here, EXTENDED — not
 * replaced. The drafted reply and the "no reply drafted" fallback below are
 * the original display, unchanged; what is new is the conversation textarea
 * and the Draft Reply button above them, and the fact that a reply drafted
 * from that textarea lands in the same box rather than a second one.
 *
 * The user pastes the LinkedIn thread here, because LinkedIn cannot be read
 * from this app. The text is kept on `gab_leads.conversation_history` so it
 * survives closing the modal, and the drafted reply is kept on
 * `gab_leads.reply_draft` so a draft made yesterday is still here today —
 * and is shown on open without anyone pressing the button again.
 *
 * Typing is never thrown away: the textarea saves on blur, there is an
 * explicit Save for people who prefer one, and drafting saves first. A
 * remote change to the row only overwrites the box when the user has no
 * unsaved edits in it.
 */
function ReplySection({
  lead,
  pipelineReply,
  responseNeeded,
  responseReason,
}: {
  lead: Lead;
  /** Whatever draft the row already carries — column or traits. */
  pipelineReply: string | null;
  responseNeeded: boolean | null;
  responseReason: string | null;
}) {
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

  // A reply just drafted wins; otherwise whatever the row already had, which
  // is what the existing display has always rendered.
  const replyDraft = fresh ?? pipelineReply;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        This dashboard cannot read LinkedIn. Paste the thread here and a reply is drafted from
        it — you still send it yourself.
      </p>

      <label className="block">
        <span className="label">Paste the LinkedIn conversation (both sides)</span>
        <textarea
          className="input mt-1 min-h-[9rem] font-normal"
          value={text}
          placeholder={'Them: Thanks for connecting…\nYou: Glad to be connected…'}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void persist(text)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
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
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          <p className="font-medium">The conversation could not be saved.</p>
          <p className="mt-1 break-words font-mono">{saveError.message}</p>
          {saveError.hint ? <p className="mt-1">{saveError.hint}</p> : null}
        </div>
      ) : null}

      {draftError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          <p className="font-medium">{draftError.message}</p>
          {draftError.hint ? <p className="mt-1 break-words">{draftError.hint}</p> : null}
        </div>
      ) : null}

      {draftWarning ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {draftWarning}
        </div>
      ) : null}

      {/* The original reply-draft display. A draft — whether it came from the
          pipeline, a previous session, or the button above — shows in this
          box; the fallback below is the untouched "no reply drafted" case. */}
      {drafting && !replyDraft ? (
        <div className="card p-4">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton mt-3 h-3 w-full" />
          <div className="skeleton mt-2 h-3 w-5/6" />
        </div>
      ) : replyDraft ? (
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
    </div>
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
  const invite = messageText(lead, 'invite_message') ?? '';
  const inmailSubject = messageText(lead, 'linkedin_inmail_subject');
  const inmailMessage = messageText(lead, 'linkedin_inmail_message');
  const pipelineReply = columnString(lead, 'reply_draft') ?? firstTrait(lead, REPLY_KEYS);
  const responseNeeded = traitBool(lead.traits, 'response_needed');
  const responseReason = traitString(lead.traits, 'response_reason');
  const detail = hasDetailedAnalysis(lead.traits);

  // Everything the pipeline wrote under a name this file does not hardcode.
  const extraMessages = discoverMessages(
    lead,
    new Set([
      'invite_message',
      'linkedin_inmail_subject',
      'linkedin_inmail_message',
      'reply_draft',
      ...REPLY_KEYS,
    ]),
    new Set([invite, inmailMessage ?? '', pipelineReply ?? ''].filter(Boolean)),
  );

  const hasAnyMessage = !!invite || !!inmailMessage || !!pipelineReply || extraMessages.length > 0;

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        Messages are drafted by the profiling pipeline and sent by you, by hand, in LinkedIn. This
        dashboard never sends anything.
      </p>

      {!hasAnyMessage ? <NoMessages lead={lead} /> : null}

      {invite ? (
        <MessageCard title="Connection invite" body={invite} limit={INVITE_CHAR_LIMIT} />
      ) : null}

      {/* The same profiling write-up the Psychographics tab leads with — the
          reasoning behind the message above — folded away by default so it
          does not push the messages themselves off the screen. */}
      {detail ? (
        <details className="card px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Details</summary>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <DetailedAnalysis traits={lead.traits} />
          </div>
        </details>
      ) : null}

      {inmailMessage ? (
        <MessageCard
          title="InMail"
          subtitle={inmailSubject ? `Subject: ${inmailSubject}` : 'No subject line was generated'}
          body={inmailMessage}
        />
      ) : null}

      {extraMessages.map((message) => (
        <MessageCard
          key={message.key}
          title={message.label}
          subtitle={message.subject ? `Subject: ${message.subject}` : null}
          body={message.body}
          limit={message.limit}
        />
      ))}

      <ReplySection
        lead={lead}
        pipelineReply={pipelineReply}
        responseNeeded={responseNeeded}
        responseReason={responseReason}
      />

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

/**
 * Nothing message-shaped was found. "No messages have been generated yet" on
 * its own is a dead end when the message demonstrably exists in the database,
 * so this also names the fields the row does carry — which is either where the
 * message actually landed, or proof that it never arrived.
 */
function NoMessages({ lead }: { lead: Lead }) {
  const fields = describeRow(lead);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-6">
      <p className="text-center text-sm font-medium text-slate-800">
        No messages have been generated yet
      </p>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-slate-600">
        Nothing on this row looks like a generated message. Message generation happens in the
        database pipeline.
      </p>

      {fields.length > 0 ? (
        <details className="mx-auto mt-4 max-w-lg">
          <summary className="cursor-pointer text-center text-xs text-slate-500 underline underline-offset-2">
            What this row does carry ({fields.length} fields)
          </summary>
          <ul className="mt-2 space-y-0.5 break-words font-mono text-[11px] text-slate-600">
            {fields.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            A message stored under one of these names is shown automatically — send this list to
            support if one of them is the message you expected to see.
          </p>
        </details>
      ) : null}
    </div>
  );
}
