import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CopyButton, EmptyState, ErrorState, InlineError, PageHeader, SkeletonCards } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { amPlatformAdmin } from '../lib/team';
import type { FriendlyError } from '../lib/supabase';
import {
  loadBotSettings,
  loadConversation,
  loadConversations,
  saveBotSettings,
  type BotConversation,
  type BotMessage,
  type BotSettings,
} from '../lib/websiteChat';

const SNIPPET = '<script src="/impact-connect-chat.js" data-endpoint="https://n8n.fisolutionz.com/webhook/website-chat" data-logo="/brand/mark.png" defer></script>';

function SettingsCard({ initial, onSaved }: { initial: BotSettings; onSaved: () => void }) {
  const [knowledge, setKnowledge] = useState(initial.knowledge);
  const [booking, setBooking] = useState(initial.booking_url);
  const [emails, setEmails] = useState(initial.handoff_emails);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = knowledge !== initial.knowledge || booking !== initial.booking_url || emails !== initial.handoff_emails;
  const save = async () => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const e = await saveBotSettings({ knowledge, booking_url: booking.trim(), handoff_emails: emails });
    setBusy(false);
    if (e) return setErr(e);
    setSaved(true);
    onSaved();
  };
  return (
    <Card
      title="What the assistant knows"
      description="It answers ONLY from this text. Change a price or a feature here and the next answer uses it."
      className="mb-6"
    >
      <label className="label" htmlFor="bot-facts">
        Facts
      </label>
      <textarea
        id="bot-facts"
        className="input mt-2 min-h-[360px] font-mono text-[13px] leading-relaxed"
        value={knowledge}
        onChange={(e) => {
          setKnowledge(e.target.value);
          setSaved(false);
        }}
      />
      <p className="mt-1 text-right text-[11px] tabular-nums text-slate-500">{knowledge.length.toLocaleString()} / 30,000</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label">Demo booking link</span>
          <input
            className="input"
            placeholder="https://calendar.app.google/… (empty: the team emails them)"
            value={booking}
            onChange={(e) => {
              setBooking(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Email the team at</span>
          <input
            className="input"
            value={emails}
            onChange={(e) => {
              setEmails(e.target.value);
              setSaved(false);
            }}
          />
          <span className="text-xs text-slate-500">When a visitor leaves their details or needs a person. Separate with commas.</span>
        </label>
      </div>
      {err ? (
        <div className="mt-3">
          <InlineError error={err} title="Not saved" />
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && !dirty ? <span className="text-xs font-medium text-emerald-700">Saved. New answers use it.</span> : null}
        {initial.knowledge_updated_at ? <span className="text-xs text-slate-500">Last changed {formatDateTime(initial.knowledge_updated_at)}</span> : null}
      </div>
      <div className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">On the website</p>
        <p className="mt-1">Put impact-connect-chat.js on the website and add this line before &lt;/body&gt;:</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="break-all rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-800">{SNIPPET}</code>
          <CopyButton text={SNIPPET} label="Copy" />
        </div>
      </div>
    </Card>
  );
}

function Transcript({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<BotMessage[] | null>(null);
  const [err, setErr] = useState<FriendlyError | null>(null);
  useEffect(() => {
    void loadConversation(id).then((r) => (r.error ? setErr(r.error) : setMsgs(r.data)));
  }, [id]);
  if (err) return <InlineError error={err} />;
  if (!msgs) return <span className="skeleton inline-block h-4 w-40" />;
  return (
    <ol className="mt-3 space-y-2" aria-label="Conversation">
      {msgs.map((m, i) => (
        <li key={i} className={`w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === 'visitor' ? 'ml-auto bg-ink text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
          {m.content}
          <span className={`mt-1 block text-[10px] ${m.role === 'visitor' ? 'text-white/70' : 'text-slate-500'}`}>{formatDateTime(m.created_at)}</span>
        </li>
      ))}
    </ol>
  );
}

function Conversations() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<BotConversation[] | null>(null);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [only, setOnly] = useState<'all' | 'leads' | 'handoff'>('all');
  const load = useCallback(async () => {
    const r = await loadConversations(days);
    if (r.error) setErr(r.error);
    else setRows(r.data);
  }, [days]);
  useEffect(() => {
    void load();
  }, [load]);
  const shown = (rows ?? []).filter((c) => (only === 'leads' ? !!c.lead_email : only === 'handoff' ? c.handoff : true));
  const leads = (rows ?? []).filter((c) => c.lead_email).length;
  const handoffs = (rows ?? []).filter((c) => c.handoff).length;
  return (
    <Card
      title="Conversations"
      description={rows ? `${rows.length} chats · ${leads} left their details · ${handoffs} needed a person` : 'Loading…'}
    >
      <div className="mb-3">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto py-1" aria-label="Show" value={only} onChange={(e) => setOnly(e.target.value as typeof only)}>
            <option value="all">All chats</option>
            <option value="leads">Left their details</option>
            <option value="handoff">Needed a person</option>
          </select>
          <select className="input w-auto py-1" aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>
      {err ? (
        <InlineError error={err} />
      ) : rows === null ? (
        <SkeletonCards count={2} />
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500">No chats in this period yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((c) => (
            <li key={c.id} className="py-3">
              <button type="button" className="block w-full min-w-0 text-left" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">{formatDateTime(c.last_at)}</span>
                  <span className="flex flex-wrap gap-1">
                    {c.lead_email ? <span className="pill border-emerald-200 bg-emerald-50 text-emerald-800">Lead</span> : null}
                    {c.handoff ? <span className="pill border-amber-200 bg-amber-50 text-amber-900">Needs a person</span> : null}
                  </span>
                </span>
                <span className="mt-1 block truncate font-semibold text-slate-900">{c.first_question ?? '(no question)'}</span>
                <span className="block truncate text-xs text-slate-500">
                  {c.messages} messages{c.language ? ` · ${c.language}` : ''}
                  {c.page_url ? ` · ${c.page_url.replace(/^https?:\/\//, '').slice(0, 60)}` : ''}
                </span>
              </button>
              {open === c.id ? (
                <div className="mt-3 rounded-2xl bg-slate-50 p-4">
                  {c.lead_email ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <span className="font-semibold text-slate-900">{c.lead_name || 'No name'}</span>
                      <a className="font-medium text-brand-700 underline" href={`mailto:${c.lead_email}`}>
                        {c.lead_email}
                      </a>
                      {c.lead_company ? <span className="text-slate-600">{c.lead_company}</span> : null}
                      {c.lead_note ? <span className="text-slate-600">“{c.lead_note}”</span> : null}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No details left.</p>
                  )}
                  {c.handoff && c.handoff_reason ? <p className="mt-1 text-xs text-amber-900">Why a person: {c.handoff_reason}</p> : null}
                  <Transcript id={c.id} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function WebsiteChatPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const load = useCallback(async () => {
    const r = await loadBotSettings();
    if (r.missing) setMissing(true);
    else if (r.error) setError(r.error);
    else setSettings(r.data);
  }, []);
  useEffect(() => {
    void amPlatformAdmin().then((a) => {
      setAdmin(a);
      if (a) void load();
    });
  }, [load]);
  if (admin === false) {
    return (
      <>
        <PageHeader title="Website chat" />
        <EmptyState title="Only the platform admin can see the website chat">Ask your administrator.</EmptyState>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="Website chat"
        description="The “Ask us anything” assistant on the website: what it knows, and every conversation and lead."
        actions={
          <Link to="/team" className="btn-secondary">
            Back to Team
          </Link>
        }
      />
      {missing ? (
        <EmptyState title="Not set up yet">Run batch_f1_chatbot_schema.sql (release 4.32) in Supabase.</EmptyState>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void load()} />
      ) : !settings ? (
        <SkeletonCards count={2} />
      ) : (
        <>
          <SettingsCard key={settings.knowledge_updated_at ?? 'x'} initial={settings} onSaved={() => void load()} />
          <Conversations />
        </>
      )}
    </>
  );
}
