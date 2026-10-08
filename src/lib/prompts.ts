import { useEffect, useState } from 'react';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/**
 * Lead Scraper prompts, kept in the dashboard instead of a Google Sheet.
 * A user can keep several prompt sets and picks one; the Lead Scraper
 * workflow reads the picked set when it profiles a lead and writes the invite.
 * Row Level Security limits every read and write to the signed-in user.
 */

export interface PromptSet {
  id: string;
  name: string;
  profiling_instructions: string;
  invite_instructions: string;
  sender_name: string;
  updated_at: string | null;
}

export type PromptSetDraft = Pick<PromptSet, 'name' | 'profiling_instructions' | 'invite_instructions' | 'sender_name'>;

export interface OutreachSettings {
  active_prompt_set_id: string | null;
  invite_char_limit: 200 | 300;
}

/** Free LinkedIn accounts allow 200 characters in an invite note, Premium 300. */
export const INVITE_LIMIT_OPTIONS: Array<{ value: 200 | 300; label: string; hint: string }> = [
  { value: 200, label: 'Free LinkedIn account', hint: 'Invite notes up to 200 characters' },
  { value: 300, label: 'LinkedIn Premium', hint: 'Invite notes up to 300 characters' },
];

export const DEFAULT_INVITE_LIMIT: 200 | 300 = 200;

type Result<T> = { data: T; error: null } | { data: null; error: FriendlyError };

function notConfigured<T>(): Result<T> {
  return { data: null, error: { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' } };
}

const SET_COLUMNS = 'id, name, profiling_instructions, invite_instructions, sender_name, updated_at';

export async function loadPromptSets(): Promise<Result<PromptSet[]>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase.from('gab_prompt_sets').select(SET_COLUMNS).order('created_at', { ascending: true });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data ?? []) as PromptSet[], error: null };
}

export async function createPromptSet(userId: string, clientId: string | null, draft: PromptSetDraft): Promise<Result<PromptSet>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_prompt_sets')
    .insert({ user_id: userId, client_id: clientId, ...clean(draft) })
    .select(SET_COLUMNS)
    .single();
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: data as PromptSet, error: null };
}

export async function updatePromptSet(id: string, draft: PromptSetDraft): Promise<Result<PromptSet>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_prompt_sets')
    .update({ ...clean(draft), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SET_COLUMNS)
    .single();
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: data as PromptSet, error: null };
}

export async function deletePromptSet(id: string): Promise<Result<true>> {
  if (!supabase) return notConfigured();
  const { error } = await supabase.from('gab_prompt_sets').delete().eq('id', id);
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: true, error: null };
}

function clean(draft: PromptSetDraft): PromptSetDraft {
  return {
    name: draft.name.trim().slice(0, 80),
    profiling_instructions: draft.profiling_instructions,
    invite_instructions: draft.invite_instructions,
    sender_name: draft.sender_name.trim(),
  };
}

export async function loadOutreachSettings(userId: string): Promise<Result<OutreachSettings>> {
  if (!supabase) return notConfigured();
  const { data, error } = await supabase
    .from('gab_comment_settings')
    .select('active_prompt_set_id, invite_char_limit')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { data: null, error: toFriendlyError(error) };
  const row = (data ?? {}) as Partial<OutreachSettings>;
  return {
    data: {
      active_prompt_set_id: row.active_prompt_set_id ?? null,
      invite_char_limit: row.invite_char_limit === 300 ? 300 : 200,
    },
    error: null,
  };
}

/** Insert-or-update by hand (users may not update user_id, so no upsert). */
export async function saveOutreachSettings(
  userId: string,
  clientId: string | null,
  fields: Partial<OutreachSettings>,
): Promise<Result<true>> {
  if (!supabase) return notConfigured();
  const { data: existing, error: readError } = await supabase
    .from('gab_comment_settings')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) return { data: null, error: toFriendlyError(readError) };
  const row = { ...fields, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('gab_comment_settings').update(row).eq('user_id', userId)
    : await supabase.from('gab_comment_settings').insert({ user_id: userId, client_id: clientId, ...row });
  if (error) return { data: null, error: toFriendlyError(error) };
  notifyInviteLimit(fields.invite_char_limit);
  return { data: true, error: null };
}

// ---------------------------------------------------------------------------
// The invite note limit, shared by every page that shows an invite counter.
// ---------------------------------------------------------------------------
let cachedLimit: 200 | 300 | null = null;
let cachedFor: string | null = null;
const listeners = new Set<(v: 200 | 300) => void>();

function notifyInviteLimit(v: 200 | 300 | undefined) {
  if (v !== 200 && v !== 300) return;
  cachedLimit = v;
  listeners.forEach((fn) => fn(v));
}

export function useInviteLimit(userId: string | null): 200 | 300 {
  const [limit, setLimit] = useState<200 | 300>(cachedLimit ?? DEFAULT_INVITE_LIMIT);
  useEffect(() => {
    listeners.add(setLimit);
    if (userId && (cachedLimit === null || cachedFor !== userId)) {
      cachedFor = userId;
      void loadOutreachSettings(userId).then((res) => {
        if (res.data) notifyInviteLimit(res.data.invite_char_limit);
      });
    }
    return () => {
      listeners.delete(setLimit);
    };
  }, [userId]);
  return limit;
}
