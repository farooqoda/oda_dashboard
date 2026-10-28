import { useEffect, useState } from 'react';
import { useAuth } from '../data/AuthProvider';
import {
  PACE_LABELS,
  TASK_PACES,
  isMissingAutopilot,
  loadAutopilotSettings,
  saveAutopilotSettings,
  type Pace,
  type PaceTask,
} from '../lib/autopilot';
import type { FriendlyError } from '../lib/supabase';
import { Card, InlineError } from './ui';

const TASKS: Array<{ task: PaceTask; field: 'comment_pace' | 'message_pace' | 'sync_pace'; title: string; noun: string }> = [
  { task: 'comment', field: 'comment_pace', title: 'Comments', noun: 'between comments' },
  { task: 'message', field: 'message_pace', title: 'Invites & messages', noun: 'between people' },
  { task: 'sync', field: 'sync_pace', title: 'Profile syncs', noun: 'between profiles' },
];

/** The safe pause each task waits between two actions (extension 4.32+). */
export function PaceCard() {
  const { user, clientId } = useAuth();
  const userId = user?.id ?? null;
  const [paces, setPaces] = useState<Record<string, Pace> | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void loadAutopilotSettings(userId).then((r) => {
      if (r.error) {
        setMissing(isMissingAutopilot(r.error));
        if (!isMissingAutopilot(r.error)) setError(r.error);
        return;
      }
      setPaces({ comment_pace: r.data.comment_pace, message_pace: r.data.message_pace, sync_pace: r.data.sync_pace });
    });
  }, [userId]);

  if (missing) return null;

  const choose = async (field: string, pace: Pace) => {
    if (!userId || !paces) return;
    const before = paces;
    setPaces({ ...paces, [field]: pace });
    setBusy(field);
    setError(null);
    const err = await saveAutopilotSettings(userId, clientId ?? null, { [field]: pace });
    setBusy(null);
    if (err) {
      setPaces(before);
      setError(err);
    }
  };

  return (
    <Card
      title="Safe pace for each task"
      description="How long the extension waits, at random, between two actions. Slower looks more human to LinkedIn. The pause between posts while collecting people is on the Conversations page."
    >
      {error ? (
        <div className="mb-4">
          <InlineError error={error} />
        </div>
      ) : null}
      {!paces ? (
        <div className="skeleton h-24 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {TASKS.map(({ task, field, title, noun }) => (
            <fieldset key={field} disabled={busy === field} className="min-w-0">
              <legend className="text-sm font-semibold text-ink">{title}</legend>
              <div className="mt-2 space-y-1.5" role="radiogroup" aria-label={title}>
                {(['careful', 'normal', 'fast'] as const).map((p) => (
                  <label
                    key={p}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                      paces[field] === p ? 'border-ink bg-slate-50' : 'border-slate-200'
                    }`}
                  >
                    <input type="radio" name={field} className="mt-0.5" checked={paces[field] === p} onChange={() => void choose(field, p)} />
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{PACE_LABELS[p].label}</span>{' '}
                      <span className="tabular-nums text-slate-600">
                        {TASK_PACES[task][p]} {noun}
                      </span>
                      <span className={`block text-xs ${p === 'fast' ? 'text-amber-700' : 'text-slate-500'}`}>{PACE_LABELS[p].hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">Changes reach the extension within 30 minutes, or right away when you reload LinkedIn. Needs extension 4.32 or newer.</p>
    </Card>
  );
}
