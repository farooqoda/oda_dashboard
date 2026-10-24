import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/** Batch F: the website assistant ("Ask us anything"), for the platform admin. */
export interface BotSettings {
  knowledge: string;
  knowledge_updated_at: string | null;
  booking_url: string;
  handoff_emails: string;
}
export interface BotConversation {
  id: string;
  started_at: string;
  last_at: string;
  messages: number;
  page_url: string | null;
  language: string | null;
  lead_name: string | null;
  lead_email: string | null;
  lead_company: string | null;
  lead_note: string | null;
  handoff: boolean;
  handoff_reason: string | null;
  first_question: string | null;
}
export interface BotMessage {
  role: 'visitor' | 'assistant';
  content: string;
  created_at: string;
}
type Result<T> = { data: T; error: null; missing?: false } | { data: null; error: FriendlyError | null; missing?: boolean };
const cfg = (): FriendlyError => ({ message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' });
const isMissing = (e: { code?: string; message?: string }) => ['PGRST202', '42883'].includes(e.code ?? '') || /could not find the function/i.test(e.message ?? '');

export async function loadBotSettings(): Promise<Result<BotSettings>> {
  if (!supabase) return { data: null, error: cfg() };
  const { data, error } = await supabase.rpc('gab_bot_settings');
  if (error) return isMissing(error) ? { data: null, error: null, missing: true } : { data: null, error: toFriendlyError(error) };
  const r = (Array.isArray(data) ? data[0] : data) as BotSettings;
  return { data: { knowledge: r?.knowledge ?? '', knowledge_updated_at: r?.knowledge_updated_at ?? null, booking_url: r?.booking_url ?? '', handoff_emails: r?.handoff_emails ?? '' }, error: null };
}
export async function saveBotSettings(s: { knowledge: string; booking_url: string; handoff_emails: string }): Promise<FriendlyError | null> {
  if (!supabase) return cfg();
  const { error } = await supabase.rpc('gab_bot_save_settings', { p_knowledge: s.knowledge, p_booking_url: s.booking_url, p_handoff_emails: s.handoff_emails });
  return error ? { message: error.message, hint: null, code: error.code ?? null } : null;
}
export async function loadConversations(days: number): Promise<Result<BotConversation[]>> {
  if (!supabase) return { data: null, error: cfg() };
  const { data, error } = await supabase.rpc('gab_bot_conversation_list', { p_days: days });
  if (error) return isMissing(error) ? { data: null, error: null, missing: true } : { data: null, error: toFriendlyError(error) };
  return { data: (data as BotConversation[]) ?? [], error: null };
}
export async function loadConversation(id: string): Promise<Result<BotMessage[]>> {
  if (!supabase) return { data: null, error: cfg() };
  const { data, error } = await supabase.rpc('gab_bot_conversation_messages', { p_id: id });
  if (error) return { data: null, error: toFriendlyError(error) };
  return { data: (data as BotMessage[]) ?? [], error: null };
}
