import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LeadModal } from '../components/modal/LeadModal';
import {
  Avatar,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  InlineError,
  PageHeader,
  SkeletonCards,
  StagePill,
  TypePill,
} from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import { useLeads } from '../data/LeadsProvider';
import { CHAT_CHAR_LIMIT, DEFAULT_STAGE } from '../lib/constants';
import { useInviteLimit } from '../lib/prompts';
import { Link } from 'react-router-dom';
import { useExtensionTask } from '../lib/extensionBridge';
import { displayName, formatDateTime, stageOf } from '../lib/format';
import {
  cancelQueuedLeads,
  loadChatPrompt,
  loadInviteQuota,
  queueLeads,
  requestChatMessages,
  runChatBatch,
  saveChatPrompt,
} from '../lib/messages';
import { personalityType } from '../lib/traitsRegistry';
import type { FriendlyError } from '../lib/supabase';
import type { Lead, SendStatus } from '../lib/types';

type TabKey = 'send' | 'queue' | 'sent' | 'failed' | 'skipped';

const sendStatusOf = (lead: Lead): SendStatus => (lead.send_status ?? 'none') as SendStatus;

const TABS: Array<{ key: TabKey; label: string; match: (l: Lead) => boolean }> = [
  {
    key: 'send',
    label: 'To send',
    match: (l) => sendStatusOf(l) === 'none' && !!l.invite_message?.trim() && stageOf(l) === DEFAULT_STAGE,
  },
  { key: 'queue', label: 'Queued', match: (l) => ['queued', 'sending'].includes(sendStatusOf(l)) },
  { key: 'sent', label: 'Sent', match: (l) => sendStatusOf(l) === 'sent' },
  { key: 'failed', label: 'Failed', match: (l) => sendStatusOf(l) === 'failed' },
  { key: 'skipped', label: 'Skipped', match: (l) => sendStatusOf(l) === 'skipped' },
];

const DEFAULT_CHAT_HINT =
  'Example: I run an AI automation agency. Write like a peer, mention one specific thing from their profile, explain in one sentence how I help companies like theirs, and ask if they are open to a short chat. Sign off as Farooq.';

// ---------------------------------------------------------------------------
// Chat prompt (for leads you are already connected to)
// ---------------------------------------------------------------------------
function ChatPromptPanel({ userId, clientId, inviteQuota }: { userId: string; clientId: string | null; inviteQuota: number | null }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadChatPrompt(userId).then((res) => {
      if (cancelled) return;
      if (res.error) setError(res.error);
      else setPrompt(res.data);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    const res = await saveChatPrompt(userId, clientId, prompt);
    if (res.error) setError(res.error);
    else setSaved(true);
    setSaving(false);
  };

  return (
    <Card
      title="How sending works"
      description={`Not connected: a connection request with your note (counts toward your daily invite limit${
        inviteQuota ? ` of ${inviteQuota}` : ''
}, shared with the invites you mark as sent in the Lead Scraper popup). Already connected: your chat message (no daily limit). One lead at a time, with a 45–120 s pause.`}
      actions={
        <button type="button" className="btn-secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide chat prompt' : 'Chat message prompt'}
        </button>
      }
      className="mb-6"
    >
      {open ? (
        <div className="space-y-3">
          <label htmlFor="chat-prompt" className="label">
            Instructions for chat messages (leads you are already connected to)
          </label>
          <p className="text-xs text-slate-500">
            Who you are, what you offer, the tone, how to sign off. Any length. The AI also reads the lead's
            profile and profiling notes. Connection notes are written by the Lead Scraper from your prompt on the Prompts page.
          </p>
          <textarea
            id="chat-prompt"
            className="input min-h-[180px] leading-relaxed"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setSaved(false);
            }}
            placeholder={DEFAULT_CHAT_HINT}
          />
          {error ? <InlineError error={error} /> : null}
          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={saving || !loaded}>
              {saving ? 'Saving…' : 'Save prompt'}
            </button>
            {saved ? <span className="text-xs font-medium text-emerald-700">Saved. New chat messages will use it.</span> : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          This app sends only what you queue here, through the GAB extension in your LinkedIn tab (task: Message Sender).
          You can still copy a note and send it yourself, then press "Mark as contacted".
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One lead
// ---------------------------------------------------------------------------
type RowAction = 'send' | 'cancel' | 'chat' | 'contacted' | 'details';

function LeadRow({
  lead,
  note,
  chat,
  selected,
  selectable,
  busy,
  onNote,
  onChat,
  onBlurNote,
  onBlurChat,
  onToggle,
  onAction,
  inviteLimit,
}: {
  lead: Lead;
  note: string;
  chat: string;
  selected: boolean;
  selectable: boolean;
  busy: boolean;
  onNote: (v: string) => void;
  onChat: (v: string) => void;
  onBlurNote: () => void;
  onBlurChat: () => void;
  onToggle: () => void;
  onAction: (a: RowAction) => void;
  inviteLimit: number;
}) {
  const status = sendStatusOf(lead);
  const editable = status === 'none' || status === 'failed' || status === 'skipped';
  const noteOver = note.length > inviteLimit;
  const chatOver = chat.length > CHAT_CHAR_LIMIT;
  const chatBusy = lead.chat_status === 'draft_requested' || lead.chat_status === 'drafting';
  const hasLink = /^https:\/\//i.test(lead.linkedin_url || '');
  const canSend = editable && hasLink && note.trim().length > 0 && !noteOver && !chatOver;

  return (
    <article className="card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 items-start gap-3 lg:w-64 lg:shrink-0">
          {selectable ? (
            <input
              type="checkbox"
              className="mt-2 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={selected}
              onChange={onToggle}
              disabled={!canSend}
              aria-label={`Select ${displayName(lead)}`}
            />
          ) : null}
          <Avatar name={displayName(lead)} size="md" />
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => onAction('details')}
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
            {lead.connection_status ? <p className="mt-1 text-[11px] text-slate-500">{lead.connection_status}</p> : null}
            {hasLink ? (
              <a href={lead.linkedin_url!} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline">
                Open profile ↗
              </a>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {status === 'failed' && lead.send_error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{lead.send_error}</p>
          ) : null}
          {status === 'skipped' && lead.send_error ? (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">Skipped: {lead.send_error}</p>
          ) : null}
          {status === 'queued' && lead.send_error ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{lead.send_error}</p>
          ) : null}
          {status === 'sent' ? (
            <p className="text-xs text-emerald-800">
              Sent {lead.send_channel === 'message' ? 'as a chat message' : 'as a connection request with note'}
              {lead.send_sent_at ? ` · ${formatDateTime(lead.send_sent_at)}` : ''}
            </p>
          ) : null}

          <div>
            <p className="label mb-1">Connection note (not connected yet)</p>
            {editable ? (
              <textarea
                className={`input min-h-[84px] leading-relaxed ${noteOver ? 'border-red-400' : ''}`}
                value={note}
                onChange={(e) => onNote(e.target.value)}
                onBlur={onBlurNote}
                aria-label="Connection note"
              />
            ) : (
              <p className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{note}</p>
            )}
            <p className={`mt-1 text-right text-[11px] tabular-nums ${noteOver ? 'font-medium text-red-700' : 'text-slate-400'}`}>
              {note.length} / {inviteLimit}
              {noteOver ? (
                <>
                  {' '}— too long for your LinkedIn account. Shorten it, or set Premium on the{' '}
                  <Link to="/prompts" className="underline">Prompts</Link> page.
                </>
              ) : null}
            </p>
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <p className="label">Chat message (already connected)</p>
              {editable ? (
                <button type="button" className="btn-ghost px-2 py-1 text-xs" disabled={busy || chatBusy} onClick={() => onAction('chat')}>
                  {chatBusy ? 'AI is writing…' : chat.trim() ? '↻ Regenerate' : '✨ Write with AI'}
                </button>
              ) : null}
            </div>
            {lead.chat_error ? <p className="mb-1 text-xs text-red-700">{lead.chat_error}</p> : null}
            {editable ? (
              <textarea
                className={`input min-h-[84px] leading-relaxed ${chatOver ? 'border-red-400' : ''}`}
                value={chat}
                onChange={(e) => onChat(e.target.value)}
                onBlur={onBlurChat}
                placeholder="Optional. Used only if you are already connected; otherwise the note above is sent as a connection request. If empty, connected leads get the note."
                aria-label="Chat message"
              />
            ) : chat ? (
              <p className="whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{chat}</p>
            ) : (
              <p className="text-xs text-slate-400">None — connected leads get the note.</p>
            )}
            {editable ? (
              <p className={`mt-1 text-right text-[11px] tabular-nums ${chatOver ? 'font-medium text-red-700' : 'text-slate-400'}`}>
                {chat.length} / {CHAT_CHAR_LIMIT}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:w-44 lg:flex-col lg:items-stretch">
          {editable ? (
            <button type="button" className="btn-primary" disabled={busy || !canSend} onClick={() => onAction('send')}
              title={!hasLink ? 'This lead has no LinkedIn link' : undefined}>
              {status === 'none' ? 'Send' : 'Try again'}
            </button>
          ) : null}
          {status === 'queued' ? (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => onAction('cancel')}>
              Cancel
            </button>
          ) : null}
          {status === 'sending' ? <span className="text-xs font-medium text-amber-800">Sending now…</span> : null}
          {editable ? <CopyButton text={note} label="Copy note" /> : null}
          {status === 'none' && stageOf(lead) === DEFAULT_STAGE ? (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAction('contacted')}>
              Mark as contacted
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function OutreachPage() {
  const { leads, loading, error, refresh, refreshing, updateLead } = useLeads();
  const { user, clientId } = useAuth();
  const userId = user?.id ?? null;
  const inviteLimit = useInviteLimit(userId);
  const extension = useExtensionTask();

  const [tab, setTab] = useState<TabKey>('send');
  const [openId, setOpenId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [chats, setChats] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [actionError, setActionError] = useState<FriendlyError | null>(null);
  const [writing, setWriting] = useState<{ done: number; remaining: number } | null>(null);
  const [queuedNotice, setQueuedNotice] = useState<number | null>(null);
  const [inviteQuota, setInviteQuota] = useState<number | null>(null);
  const writingRef = useRef(false);

  useEffect(() => {
    if (userId) void loadInviteQuota(userId).then(setInviteQuota);
  }, [userId]);

  const noteFor = (l: Lead) => notes[l.id] ?? l.invite_message ?? '';
  const chatFor = (l: Lead) => chats[l.id] ?? l.chat_message ?? '';

  const counts = useMemo(() => {
    const c = {} as Record<TabKey, number>;
    for (const t of TABS) c[t.key] = leads.filter(t.match).length;
    return c;
  }, [leads]);

  const visible = useMemo(() => leads.filter(TABS.find((t) => t.key === tab)!.match), [leads, tab]);

  const sendable = useCallback(
    (l: Lead) => {
      const st = sendStatusOf(l);
      const note = (notes[l.id] ?? l.invite_message ?? '').trim();
      const chat = chats[l.id] ?? l.chat_message ?? '';
      return (
        ['none', 'failed', 'skipped'].includes(st) &&
        /^https:\/\//i.test(l.linkedin_url || '') &&
        note.length > 0 &&
        note.length <= inviteLimit &&
        chat.length <= CHAT_CHAR_LIMIT
      );
    },
    [notes, chats, inviteLimit],
  );

  const selectableInView = visible.filter(sendable);
  const selectedInView = selectableInView.filter((l) => selected.has(l.id));
  const showCheckboxes = tab === 'send' || tab === 'failed' || tab === 'skipped';

  const markBusy = (ids: number[], on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  // Save any edited text before it is used.
  const saveTexts = async (l: Lead): Promise<FriendlyError | null> => {
    const patch: { invite_message?: string; chat_message?: string } = {};
    if (notes[l.id] !== undefined && notes[l.id] !== (l.invite_message ?? '')) patch.invite_message = notes[l.id];
    if (chats[l.id] !== undefined && chats[l.id] !== (l.chat_message ?? '')) patch.chat_message = chats[l.id];
    if (Object.keys(patch).length === 0) return null;
    return updateLead(l.id, patch);
  };

  const runWriting = useCallback(async () => {
    if (!userId || writingRef.current) return;
    writingRef.current = true;
    let done = 0;
    setWriting({ done: 0, remaining: 0 });
    for (let round = 0; round < 100; round++) {
      const res = await runChatBatch(userId);
      if (res.error) {
        setActionError(res.error);
        break;
      }
      done += res.data.drafted + res.data.failed;
      setWriting({ done, remaining: res.data.remaining });
      refresh();
      if (res.data.remaining === 0) break;
      if (res.data.drafted + res.data.failed === 0) await new Promise((r) => window.setTimeout(r, 3000));
    }
    setWriting(null);
    writingRef.current = false;
    refresh();
  }, [userId, refresh]);

  const writeChats = async (items: Lead[]) => {
    if (!userId || items.length === 0) return;
    setActionError(null);
    const ids = items.map((l) => l.id);
    markBusy(ids, true);
    setChats((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    const res = await requestChatMessages(ids, userId);
    markBusy(ids, false);
    if (res.error) setActionError(res.error);
    else {
      refresh();
      void runWriting();
    }
  };

  const send = async (items: Lead[]) => {
    if (!userId || items.length === 0) return;
    setActionError(null);
    const ids = items.map((l) => l.id);
    markBusy(ids, true);
    for (const l of items) {
      const err = await saveTexts(l);
      if (err) {
        setActionError(err);
        markBusy(ids, false);
        return;
      }
    }
    const res = await queueLeads(ids, userId);
    markBusy(ids, false);
    if (res.error) {
      setActionError(res.error);
      return;
    }
    setNotes((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    setChats((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
    setSelected(new Set());
    setQueuedNotice(res.data);
    if (extension.status === 'connected') extension.chooseTask('message_sender');
    refresh();
  };

  const onAction = async (l: Lead, action: RowAction) => {
    if (action === 'details') return setOpenId(l.id);
    if (action === 'send') return send([l]);
    if (action === 'chat') return writeChats([l]);
    if (action === 'cancel') {
      markBusy([l.id], true);
      const res = await cancelQueuedLeads([l.id]);
      markBusy([l.id], false);
      if (res.error) setActionError(res.error);
      return refresh();
    }
    if (action === 'contacted') {
      markBusy([l.id], true);
      const err = await updateLead(l.id, { stage: 'Contacted' });
      markBusy([l.id], false);
      if (err) setActionError(err);
    }
  };

  const blurSave = async (l: Lead) => {
    const err = await saveTexts(l);
    if (err) setActionError(err);
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
        description="Leads with a drafted message. Review and edit, then send the ones you choose — the GAB extension sends them from your LinkedIn, one at a time. Or copy and send yourself."
        actions={
          <button type="button" className="btn-secondary" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {userId ? <ChatPromptPanel userId={userId} clientId={clientId} inviteQuota={inviteQuota} /> : null}

      {writing ? (
        <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
          The AI is writing chat messages… {writing.done} done{writing.remaining ? `, ${writing.remaining} to go` : ''}.
        </p>
      ) : null}

      {queuedNotice ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            {queuedNotice} {queuedNotice === 1 ? 'lead is' : 'leads are'} queued.{' '}
            {extension.status === 'connected'
              ? 'Your extension is now set to Message Sender. Open LinkedIn and press Start in the Message Sender panel.'
              : 'Open LinkedIn with the GAB extension and choose Message Sender on the Dashboard.'}
          </span>
          <span className="flex items-center gap-2">
            <a href="https://www.linkedin.com/feed/" target="_blank" rel="noreferrer" className="btn-secondary">
              Open LinkedIn ↗
            </a>
            <button type="button" className="btn-ghost" onClick={() => setQueuedNotice(null)}>
              Close
            </button>
          </span>
        </div>
      ) : null}

      {actionError ? (
        <div className="mb-4">
          <InlineError error={actionError} />
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setSelected(new Set());
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs tabular-nums text-slate-400">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {showCheckboxes && selectableInView.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              checked={selectedInView.length === selectableInView.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(selectableInView.map((l) => l.id)) : new Set())}
            />
            Select all ({selectableInView.length})
          </label>
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={selectedInView.length === 0 || writing !== null}
              onClick={() => void writeChats(selectedInView)}
            >
              ✨ Write chat messages ({selectedInView.length})
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={selectedInView.length === 0}
              onClick={() => void send(selectedInView)}
            >
              Send selected ({selectedInView.length})
            </button>
          </span>
        </div>
      ) : null}

      {loading ? (
        <SkeletonCards count={4} />
      ) : visible.length === 0 ? (
        <EmptyState title={tab === 'send' ? 'Nothing waiting to be sent' : 'No leads in this list'}>
          {tab === 'send'
            ? leads.length === 0
              ? 'No leads are loaded yet. Sync profiles with the Lead Scraper first.'
              : 'Every lead with a drafted message is already queued, sent or past the New Lead stage. New leads from the Lead Scraper appear here.'
            : 'Nothing here right now.'}
        </EmptyState>
      ) : (
        <div className={`space-y-4 ${refreshing ? 'is-refreshing' : ''}`}>
          {visible.map((l) => (
            <LeadRow
              key={l.id}
              lead={l}
              note={noteFor(l)}
              chat={chatFor(l)}
              selected={selected.has(l.id)}
              selectable={showCheckboxes}
              busy={busyIds.has(l.id) || sendStatusOf(l) === 'sending'}
              onNote={(v) => setNotes((p) => ({ ...p, [l.id]: v }))}
              onChat={(v) => setChats((p) => ({ ...p, [l.id]: v }))}
              onBlurNote={() => void blurSave(l)}
              onBlurChat={() => void blurSave(l)}
              onToggle={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(l.id)) next.delete(l.id);
                  else next.add(l.id);
                  return next;
                })
              }
              onAction={(a) => void onAction(l, a)}
              inviteLimit={inviteLimit}
            />
          ))}
        </div>
      )}

      <LeadModal leadId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
