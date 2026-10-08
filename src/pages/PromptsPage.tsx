import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, ErrorState, InlineError, PageHeader, SkeletonCards } from '../components/ui';
import { useAuth } from '../data/AuthProvider';
import { loadChatPrompt, saveChatPrompt } from '../lib/messages';
import {
  INVITE_LIMIT_OPTIONS,
  createPromptSet,
  deletePromptSet,
  loadOutreachSettings,
  loadPromptSets,
  saveOutreachSettings,
  updatePromptSet,
  type PromptSet,
  type PromptSetDraft,
} from '../lib/prompts';
import type { FriendlyError } from '../lib/supabase';
import { CommentPromptPanel } from './CommentsPage';

const EMPTY: PromptSetDraft = { name: '', profiling_instructions: '', invite_instructions: '', sender_name: '' };

const PROFILING_HINT =
  'Example: You review LinkedIn profiles for Ontario Digital Academy. Decide which of our programs fits this person, what they may need, and what relationship value they could offer. Separate facts from guesses.';
const INVITE_HINT =
  'Example: We are a registered Ontario not-for-profit helping small businesses and newcomers with AI and digital skills. Mention one specific thing from their profile. Warm, no selling, no links.';
const CHAT_HINT =
  'Example: Write like a peer, mention one specific thing from their profile, explain in one sentence how we help organizations like theirs, and ask if they are open to a short chat.';

function sameDraft(a: PromptSetDraft, b: PromptSetDraft) {
  return (
    a.name === b.name &&
    a.profiling_instructions === b.profiling_instructions &&
    a.invite_instructions === b.invite_instructions &&
    a.sender_name === b.sender_name
  );
}

function toDraft(p: PromptSet): PromptSetDraft {
  return {
    name: p.name,
    profiling_instructions: p.profiling_instructions ?? '',
    invite_instructions: p.invite_instructions ?? '',
    sender_name: p.sender_name ?? '',
  };
}

// ---------------------------------------------------------------------------
// Lead Scraper prompt sets
// ---------------------------------------------------------------------------
function LeadPromptSets({ userId, clientId, inviteLimit }: { userId: string; clientId: string | null; inviteLimit: number }) {
  const [sets, setSets] = useState<PromptSet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<PromptSetDraft>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, o] = await Promise.all([loadPromptSets(), loadOutreachSettings(userId)]);
    if (s.error) setLoadError(s.error);
    else if (o.error) setLoadError(o.error);
    else {
      setLoadError(null);
      setSets(s.data);
      setActiveId(o.data.active_prompt_set_id);
      return { sets: s.data, active: o.data.active_prompt_set_id };
    }
    return null;
  }, [userId]);

  useEffect(() => {
    void load().then((res) => {
      setLoaded(true);
      if (res && res.sets.length) {
        const first = res.sets.find((x) => x.id === res.active) ?? res.sets[0];
        setOpenId(first.id);
        setDraft(toDraft(first));
      }
    });
  }, [load]);

  const openSet = useMemo(() => (openId && openId !== 'new' ? sets.find((x) => x.id === openId) ?? null : null), [openId, sets]);
  const baseline = openSet ? toDraft(openSet) : EMPTY;
  const dirty = openId !== null && !sameDraft(draft, baseline);

  const confirmLeave = () => !dirty || window.confirm('You have unsaved changes in this prompt set. Discard them?');

  const choose = (id: string | 'new') => {
    if (id === openId || !confirmLeave()) return;
    setError(null);
    setNotice(null);
    setOpenId(id);
    if (id === 'new') setDraft({ ...EMPTY, name: sets.length ? '' : 'My prompt' });
    else setDraft(toDraft(sets.find((x) => x.id === id)!));
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError({ message: 'Give this prompt set a name.', hint: null, code: 'NAME' });
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = openId === 'new' ? await createPromptSet(userId, clientId, draft) : await updatePromptSet(openId as string, draft);
    if (res.error) setError(res.error);
    else {
      // The very first set is put to use straight away.
      if (openId === 'new' && !activeId) {
        const act = await saveOutreachSettings(userId, clientId, { active_prompt_set_id: res.data.id });
        if (act.error) setError(act.error);
      }
      await load();
      setOpenId(res.data.id);
      setDraft(toDraft(res.data));
      setNotice('Saved.');
    }
    setBusy(false);
  };

  const use = async (id: string) => {
    setBusy(true);
    setError(null);
    const res = await saveOutreachSettings(userId, clientId, { active_prompt_set_id: id });
    if (res.error) setError(res.error);
    else {
      setActiveId(id);
      setNotice('In use. The next lead you sync uses this prompt set.');
    }
    setBusy(false);
  };

  const duplicate = () => {
    if (!confirmLeave()) return;
    setOpenId('new');
    setDraft({ ...draft, name: `${draft.name || 'Prompt'} (copy)`.slice(0, 80) });
    setNotice(null);
  };

  const remove = async () => {
    if (!openSet || !window.confirm(`Delete "${openSet.name}"? This cannot be undone.`)) return;
    setBusy(true);
    const res = await deletePromptSet(openSet.id);
    if (res.error) setError(res.error);
    else {
      const next = await load();
      const first = next?.sets[0] ?? null;
      setOpenId(first ? first.id : null);
      setDraft(first ? toDraft(first) : EMPTY);
      setNotice(null);
    }
    setBusy(false);
  };

  const field = (key: keyof PromptSetDraft) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft((d) => ({ ...d, [key]: e.target.value }));
      setNotice(null);
    },
  });

  if (!loaded) return <SkeletonCards count={1} />;
  if (loadError) return <ErrorState error={loadError} onRetry={() => void load()} />;

  return (
    <Card
      title="Lead Scraper prompts"
      description="Used when the extension syncs a LinkedIn profile: the AI profiles the lead and writes the connection note. Keep as many prompt sets as you like and choose the one in use."
      className="mb-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row">
        {/* The list */}
        <div className="lg:w-64 lg:shrink-0">
          <ul className="space-y-1.5" aria-label="Prompt sets">
            {sets.map((set) => (
              <li key={set.id}>
                <button
                  type="button"
                  onClick={() => choose(set.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    openId === set.id ? 'border-brand-500 bg-brand-50 text-brand-900' : 'border-line bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                  aria-current={openId === set.id ? 'true' : undefined}
                >
                  <span className="truncate font-medium">{set.name}</span>
                  {activeId === set.id ? (
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      In use
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-secondary mt-3 w-full" onClick={() => choose('new')} disabled={busy}>
            + New prompt set
          </button>
          {!sets.length ? (
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              No prompt sets yet. Until you save one, the Lead Scraper uses your team's prompt set, or a built-in
              default if nobody has one. Copy your old Google Sheet prompt here to keep using it.
            </p>
          ) : !activeId ? (
            <p className="mt-3 text-xs leading-relaxed text-amber-800">
              None is in use yet. Open one and press "Use this prompt set".
            </p>
          ) : null}
        </div>

        {/* The editor */}
        {openId ? (
          <form
            className="min-w-0 flex-1 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ps-name" className="block text-sm font-medium text-slate-800">
                  Name
                </label>
                <input id="ps-name" className="input mt-1" maxLength={80} placeholder="e.g. Nonprofit leaders" {...field('name')} />
              </div>
              <div>
                <label htmlFor="ps-sender" className="block text-sm font-medium text-slate-800">
                  Your name, for signing messages
                </label>
                <input id="ps-sender" className="input mt-1" placeholder="e.g. Bashir" {...field('sender_name')} />
              </div>
            </div>

            <div>
              <label htmlFor="ps-profiling" className="block text-sm font-medium text-slate-800">
                Profiling instructions
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                How the AI should read a profile and what it should work out. Any length. The fit score, bucket and
                personality fields are always added.
              </p>
              <textarea id="ps-profiling" className="input mt-2 min-h-[260px] leading-relaxed" placeholder={PROFILING_HINT} {...field('profiling_instructions')} />
              <p className="mt-1 text-right text-[11px] tabular-nums text-slate-400">
                {draft.profiling_instructions.length.toLocaleString()} characters
              </p>
            </div>

            <div>
              <label htmlFor="ps-invite" className="block text-sm font-medium text-slate-800">
                Connection note instructions
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Who you are and what the note should say. The note is always kept under {inviteLimit} characters, your
                LinkedIn limit below.
              </p>
              <textarea id="ps-invite" className="input mt-2 min-h-[140px] leading-relaxed" placeholder={INVITE_HINT} {...field('invite_instructions')} />
            </div>

            {error ? <InlineError error={error} /> : null}

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn-primary" disabled={busy || (!dirty && openId !== 'new')}>
                {busy ? 'Saving…' : openId === 'new' ? 'Create prompt set' : 'Save changes'}
              </button>
              {openSet && activeId !== openSet.id ? (
                <button type="button" className="btn-secondary" disabled={busy || dirty} onClick={() => void use(openSet.id)}
                  title={dirty ? 'Save your changes first' : undefined}>
                  Use this prompt set
                </button>
              ) : null}
              {openSet ? (
                <>
                  <button type="button" className="btn-ghost" disabled={busy} onClick={duplicate}>
                    Duplicate
                  </button>
                  <button type="button" className="btn-ghost text-red-700 hover:bg-red-50" disabled={busy} onClick={() => void remove()}>
                    Delete
                  </button>
                </>
              ) : (
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => {
                  const first = sets.find((x) => x.id === activeId) ?? sets[0];
                  setOpenId(first ? first.id : null);
                  setDraft(first ? toDraft(first) : EMPTY);
                  setError(null);
                }}>
                  Cancel
                </button>
              )}
              {notice ? <span className="text-xs font-medium text-emerald-700">{notice}</span> : null}
              {dirty && !notice ? <span className="text-xs text-amber-800">Unsaved changes</span> : null}
            </div>
          </form>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line p-8 text-sm text-slate-600">
            Press "New prompt set" to write your first one.
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// LinkedIn account: invite note length
// ---------------------------------------------------------------------------
function InviteLength({
  userId,
  clientId,
  value,
  onChange,
}: {
  userId: string;
  clientId: string | null;
  value: 200 | 300;
  onChange: (v: 200 | 300) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState(false);

  const pick = async (v: 200 | 300) => {
    if (v === value) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveOutreachSettings(userId, clientId, { invite_char_limit: v });
    if (res.error) setError(res.error);
    else {
      onChange(v);
      setSaved(true);
    }
    setBusy(false);
  };

  return (
    <Card
      title="Your LinkedIn account"
      description="LinkedIn limits how long a connection note can be. New notes are written to fit, and the Outreach page checks every note against it."
      className="mb-6"
    >
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
        <legend className="sr-only">LinkedIn account type</legend>
        {INVITE_LIMIT_OPTIONS.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
              value === o.value ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:bg-slate-50'
            }`}
          >
            <input
              type="radio"
              name="invite-limit"
              className="mt-0.5 h-4 w-4 text-brand-600"
              checked={value === o.value}
              onChange={() => void pick(o.value)}
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">{o.label}</span>
              <span className="block text-xs text-slate-600">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error ? <div className="mt-3"><InlineError error={error} /></div> : null}
      {saved ? <p className="mt-3 text-xs font-medium text-emerald-700">Saved.</p> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chat message prompt (leads you are already connected to)
// ---------------------------------------------------------------------------
function ChatPrompt({ userId, clientId }: { userId: string; clientId: string | null }) {
  const [prompt, setPrompt] = useState('');
  const [initial, setInitial] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  useEffect(() => {
    void loadChatPrompt(userId).then((res) => {
      if (res.error) setError(res.error);
      else {
        setPrompt(res.data);
        setInitial(res.data);
      }
      setLoaded(true);
    });
  }, [userId]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveChatPrompt(userId, clientId, prompt);
    if (res.error) setError(res.error);
    else {
      setSaved(true);
      setInitial(prompt);
    }
    setBusy(false);
  };

  return (
    <Card
      title="Chat message prompt"
      description="For leads you are already connected to: the longer message the Message Sender sends in their chat."
      className="mb-6"
    >
      <textarea
        aria-label="Chat message instructions"
        className="input min-h-[160px] leading-relaxed"
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          setSaved(false);
        }}
        placeholder={CHAT_HINT}
        disabled={!loaded}
      />
      {error ? <div className="mt-3"><InlineError error={error} /></div> : null}
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className="btn-primary" onClick={() => void save()} disabled={busy || !loaded || prompt === initial}>
          {busy ? 'Saving…' : 'Save prompt'}
        </button>
        {saved ? <span className="text-xs font-medium text-emerald-700">Saved. New chat messages will use it.</span> : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function PromptsPage() {
  const { user, clientId } = useAuth();
  const userId = user?.id ?? null;
  const [inviteLimit, setInviteLimit] = useState<200 | 300 | null>(null);

  useEffect(() => {
    if (!userId) return;
    void loadOutreachSettings(userId).then((res) => setInviteLimit(res.data ? res.data.invite_char_limit : 200));
  }, [userId]);

  if (!userId) return null;

  return (
    <>
      <PageHeader
        title="Prompts"
        description="Everything the AI writes for you follows these instructions. Changes apply to the next lead, comment or message."
      />
      {inviteLimit === null ? (
        <SkeletonCards count={2} />
      ) : (
        <>
          <LeadPromptSets userId={userId} clientId={clientId} inviteLimit={inviteLimit} />
          <InviteLength userId={userId} clientId={clientId} value={inviteLimit} onChange={setInviteLimit} />
        </>
      )}
      <ChatPrompt userId={userId} clientId={clientId} />
      <CommentPromptPanel userId={userId} clientId={clientId} defaultOpen />
    </>
  );
}
