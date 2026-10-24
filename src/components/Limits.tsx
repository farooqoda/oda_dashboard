import { useCallback, useEffect, useState } from 'react';
import { Card, InlineError } from './ui';
import {
  COMMENT_RANGE,
  INVITE_RANGE,
  loadMemberLimits,
  loadMyLimits,
  resetText,
  saveMemberLimits,
  validLimit,
  type MemberLimit,
  type MyLimits,
} from '../lib/limits';
import type { FriendlyError } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Team page: the admin / manager sets each member's daily limits
// ---------------------------------------------------------------------------
function LimitRow({ m, onSaved }: { m: MemberLimit; onSaved: (m: MemberLimit) => void }) {
  const [inv, setInv] = useState(String(m.invite_quota));
  const [com, setCom] = useState(String(m.comment_limit));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FriendlyError | null>(null);
  const [saved, setSaved] = useState(false);
  const i = validLimit(inv, INVITE_RANGE);
  const c = validLimit(com, COMMENT_RANGE);
  const dirty = inv !== String(m.invite_quota) || com !== String(m.comment_limit);
  const who = m.email ?? m.user_id;

  const save = async () => {
    if (i === null || c === null) return;
    setBusy(true);
    setErr(null);
    setSaved(false);
    const e = await saveMemberLimits(m.user_id, i, c);
    setBusy(false);
    if (e) return setErr(e);
    setSaved(true);
    onSaved({ ...m, invite_quota: i, comment_limit: c });
  };

  return (
    <tr className="border-b border-slate-100 align-top last:border-0">
      <td className="px-4 py-3">
        <p className="font-semibold text-slate-900">{who}</p>
        <p className="text-xs text-slate-500">
          {m.invites_today} {m.invites_today === 1 ? 'invite' : 'invites'} since {resetText(m.tz)}
        </p>
        {err ? (
          <div className="mt-2">
            <InlineError error={err} title="Not saved" />
          </div>
        ) : null}
      </td>
      <td className="px-2 py-3">
        <input
          className="input w-20 py-1 text-right tabular-nums"
          inputMode="numeric"
          aria-label={`Invites a day for ${who}`}
          value={inv}
          onChange={(e) => {
            setInv(e.target.value);
            setSaved(false);
          }}
        />
        {i === null ? <p className="mt-1 text-[11px] text-red-700">1 to 100</p> : null}
      </td>
      <td className="px-2 py-3">
        <input
          className="input w-20 py-1 text-right tabular-nums"
          inputMode="numeric"
          aria-label={`Comments a day for ${who}`}
          value={com}
          onChange={(e) => {
            setCom(e.target.value);
            setSaved(false);
          }}
        />
        {c === null ? <p className="mt-1 text-[11px] text-red-700">1 to 50</p> : null}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          className="btn-secondary py-1"
          aria-label={`Save limits for ${who}`}
          disabled={!dirty || busy || i === null || c === null}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {saved && !dirty ? <span className="ml-2 text-xs text-emerald-700">Saved</span> : null}
      </td>
    </tr>
  );
}

export function MemberLimitsCard({ client }: { client: string }) {
  const [rows, setRows] = useState<MemberLimit[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);
  const load = useCallback(async () => {
    const r = await loadMemberLimits();
    if (r.missing) setMissing(true);
    else if (r.error) setError(r.error);
    else setRows(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (missing) return null;
  const shown = (rows ?? []).filter((r) => !client || r.client_id === client);
  const byClient = new Map<string, MemberLimit[]>();
  for (const r of shown) byClient.set(r.client_id, [...(byClient.get(r.client_id) ?? []), r]);

  return (
    <Card
      title="Daily limits"
      description="How many connection requests and comments each member may send a day. Members cannot change these themselves."
      className="mb-6"
    >
      {error ? (
        <InlineError error={error} title="Could not load the limits" />
      ) : rows === null ? (
        <span className="skeleton inline-block h-4 w-48" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500">No members yet.</p>
      ) : (
        <div className="space-y-5">
          {[...byClient.entries()].map(([cid, members]) => (
            <div key={cid} className="overflow-x-auto">
              {byClient.size > 1 || !client ? <h3 className="mb-1 text-sm font-semibold text-slate-900">{cid}</h3> : null}
              <table className="w-full min-w-[560px] table-fixed text-sm" aria-label={`${cid} limits`}>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="w-1/2 px-4 py-2 font-medium">Member</th>
                    <th className="px-2 py-2 font-medium" title="Connection requests, counted from midnight in the member's own time zone">
                      Invites a day
                    </th>
                    <th className="px-2 py-2 font-medium" title="Comments, counted over the last 24 hours">
                      Comments a day
                    </th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <LimitRow
                      key={m.user_id}
                      m={m}
                      onSaved={(n) => setRows((all) => (all ?? []).map((x) => (x.user_id === n.user_id ? { ...x, ...n } : x)))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            LinkedIn does not publish official limits. A safe start is 15–25 invites and 10–20 comments a day; new or quiet accounts
            should stay lower (warm-up in the member’s Settings raises invites slowly). Invites start again at midnight in each
            member’s own time zone (their Settings); comments count over the last 24 hours.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Settings: the member sees their own limits (read-only)
// ---------------------------------------------------------------------------
export function MyLimitsCard() {
  const [me, setMe] = useState<MyLimits | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const load = () =>
      void loadMyLimits().then((r) => {
        if (r.missing) setMissing(true);
        else if (r.data) setMe(r.data);
      });
    load();
    // the time zone in "Working hours" changes when the day starts
    window.addEventListener('gab-automation-changed', load);
    return () => window.removeEventListener('gab-automation-changed', load);
  }, []);
  if (missing || !me) return null;
  const left = Math.max(0, me.invite_limit_today - me.invites_today);
  const warm = me.invite_limit_today < me.invite_quota;
  return (
    <Card title="Your daily limits" description="Set by your administrator or team manager.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-500">Connection requests today</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {me.invites_today} <span className="text-base font-normal text-slate-500">of {me.invite_limit_today}</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {left > 0 ? `${left} left today.` : 'Done for today.'} Starts again at {resetText(me.tz)}
            {warm ? ` · warm-up: ${me.invite_limit_today} today, up to ${me.invite_quota}` : ''}.
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Comments</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {me.comment_limit} <span className="text-base font-normal text-slate-500">a day</span>
          </p>
          <p className="mt-1 text-xs text-slate-600">Counted over the last 24 hours.</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Your day follows “Your time zone” below. Need a different limit? Ask your manager.
      </p>
    </Card>
  );
}
