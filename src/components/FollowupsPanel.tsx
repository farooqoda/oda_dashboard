import { Translation } from './Languages';
import { useState } from 'react';
import { Avatar, EmptyState, InlineError, StagePill } from './ui';
import { CHAT_CHAR_LIMIT } from '../lib/constants';
import { displayName, formatDate, formatDateTime, stageOf } from '../lib/format';
import {
  approveFollowup,
  approveReply,
  replyHandled,
  rewriteFollowup,
  rewriteReply,
  saveFollowupText,
  saveReplyText,
  stopFollowups,
  unqueueFollowup,
  unqueueReply,
} from '../lib/followups';
import type { FriendlyError } from '../lib/supabase';
import type { Lead } from '../lib/types';

type Kind = 'followup' | 'reply';

/** Follow-ups and Replies tabs of Message Studio: review the AI's draft, then send, skip or rewrite. */
export function FollowupList({
  kind,
  leads,
  userId,
  followupTotal,
  onChanged,
  onOpen,
}: {
  kind: Kind;
  leads: Lead[];
  userId: string;
  followupTotal: number;
  onChanged: () => void;
  onOpen: (id: number) => void;
}) {
  if (leads.length === 0) {
    return (
      <EmptyState title={kind === 'followup' ? 'No follow-ups waiting' : 'No replies waiting'}>
        {kind === 'followup'
          ? 'When someone has not written back a few days after your message (or after accepting your invite), the AI writes a follow-up and it appears here for you to approve.'
          : 'When the extension finds that someone wrote back, the AI drafts an answer and it appears here. Nothing is sent until you approve it.'}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      {leads.map((l) => (
        <DraftRow key={l.id} kind={kind} lead={l} userId={userId} followupTotal={followupTotal} onChanged={onChanged} onOpen={onOpen} />
      ))}
    </div>
  );
}

function DraftRow({
  kind,
  lead,
  userId,
  followupTotal,
  onChanged,
  onOpen,
}: {
  kind: Kind;
  lead: Lead;
  userId: string;
  followupTotal: number;
  onChanged: () => void;
  onOpen: (id: number) => void;
}) {
  const saved = (kind === 'followup' ? lead.followup_draft : lead.reply_draft) ?? '';
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const value = text ?? saved;
  const status = kind === 'followup' ? lead.followup_status ?? 'none' : lead.reply_draft_status ?? 'none';
  const queued = lead.send_kind === kind && (lead.send_status === 'queued' || lead.send_status === 'sending');
  const sending = queued && lead.send_status === 'sending';
  const writing = !queued && (status === 'drafting' || status === 'redraft' || (kind === 'reply' && status === 'none'));
  const ready = !queued && (status === 'drafted' || status === 'failed') && saved.trim().length > 0;
  const over = value.length > CHAT_CHAR_LIMIT;
  const hasLink = /^https:\/\//i.test(lead.linkedin_url || '');
  const step = Math.min((lead.followup_step ?? 0) + 1, Math.max(followupTotal, 1));
  const error = kind === 'followup' ? lead.followup_error : lead.send_error;

  const act = async (fn: () => Promise<{ error: FriendlyError | null; data: number | null }>) => {
    setBusy(true);
    setErr(null);
    const r = await fn();
    setBusy(false);
    if (r.error) setErr(r.error);
    else {
      setText(null);
      onChanged();
    }
  };
  const approve = () => act(() => (kind === 'followup' ? approveFollowup(lead, value, userId) : approveReply(lead, value, userId)));
  const saveText = async () => {
    if (text === null || text === saved || !ready) return;
    const r = kind === 'followup' ? await saveFollowupText(lead, text) : await saveReplyText(lead, text);
    if (r.error) setErr(r.error);
  };

  const their = (lead.reply_snippet ?? '').replace(/^[^:]{1,40}:\s*/, '');

  return (
    <article className="card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 items-start gap-3 lg:w-64 lg:shrink-0">
          <Avatar name={displayName(lead)} size="md" />
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(lead.id)}
              className="block max-w-full truncate text-sm font-medium text-slate-900 underline-offset-2 hover:underline"
            >
              {displayName(lead)}
            </button>
            <p className="line-clamp-2 break-words text-xs text-slate-600">
              {[lead.title?.trim(), lead.company?.trim()].filter(Boolean).join(' · ') || 'No title recorded'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StagePill stage={stageOf(lead)} />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {kind === 'followup'
                ? `${lead.send_channel === 'message' ? 'Message' : 'Invite'} sent ${lead.send_sent_at ? formatDate(lead.send_sent_at) : ''}${
                    lead.followup_last_sent_at ? ` · last follow-up ${formatDate(lead.followup_last_sent_at)}` : ''
                  }`
                : `Wrote back ${lead.reply_detected_at ? formatDate(lead.reply_detected_at) : ''}`}
            </p>
            {hasLink ? (
              <a href={lead.linkedin_url!} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">
                Open profile ↗
              </a>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {kind === 'reply' && their ? (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-800">Their message</p>
              <p className="mt-0.5 whitespace-pre-wrap">“{their}”</p>
              <p className="mt-1 text-[11px] text-emerald-800">LinkedIn shows only the start of long messages; open the conversation for the rest.</p>
            </div>
          ) : null}
          {status === 'failed' && error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</p>
          ) : null}

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label" htmlFor={`fu-${kind}-${lead.id}`}>
                {kind === 'followup' ? `Follow-up ${step} of ${followupTotal}` : 'Your reply (AI draft)'}
              </label>
              {queued ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  {sending ? 'Sending now…' : `Queued ${lead.send_queued_at ? formatDateTime(lead.send_queued_at) : ''}`}
                </span>
              ) : writing ? (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-900">AI is writing…</span>
              ) : null}
            </div>
            {writing && !saved ? (
              <div className="skeleton h-20 w-full" aria-label="The AI is writing this message" />
            ) : (
              <textarea
                id={`fu-${kind}-${lead.id}`}
                className="input min-h-[110px] leading-relaxed"
                value={value}
                readOnly={!ready}
                onChange={(e) => setText(e.target.value)}
                onBlur={() => void saveText()}
              />
            )}
            <Translation text={writing && !saved ? '' : value} />
            {ready ? (
              <p className={`mt-1 text-right text-[11px] tabular-nums ${over ? 'font-medium text-red-700' : 'text-slate-400'}`}>
                {value.length}/{CHAT_CHAR_LIMIT}
              </p>
            ) : null}
          </div>

          {err ? <InlineError error={err} /> : null}

          <div className="flex flex-wrap items-center gap-2">
            {ready ? (
              <button type="button" className="btn-primary" disabled={busy || !value.trim() || over || !hasLink} onClick={() => void approve()}>
                {kind === 'followup' ? 'Approve & send' : 'Approve & send reply'}
              </button>
            ) : null}
            {!queued && (status === 'drafted' || status === 'failed') ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void act(() => (kind === 'followup' ? rewriteFollowup([lead.id]) : rewriteReply([lead.id])))}
                >
                  ✨ Rewrite
                </button>
              </>
            ) : null}
            {queued && !sending ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => void act(() => (kind === 'followup' ? unqueueFollowup([lead.id]) : unqueueReply([lead.id])))}
              >
                Take out of the queue
              </button>
            ) : null}
            {!queued ? (
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => void act(() => (kind === 'followup' ? stopFollowups([lead.id]) : replyHandled([lead.id])))}
              >
                {kind === 'followup' ? 'No more follow-ups' : 'I answered myself'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
