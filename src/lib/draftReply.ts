import { DRAFT_REPLY_WEBHOOK } from './constants';
import type { FriendlyError } from './supabase';

/**
 * THE DRAFT-REPLY WEBHOOK
 * =======================
 * The only outbound call this dashboard makes to anything other than Supabase.
 * It hands a pasted LinkedIn conversation to the n8n workflow and gets one
 * drafted reply back. Nothing is sent anywhere: the draft is shown, copied by
 * hand, and pasted into LinkedIn by the user, exactly like every other message
 * on the Outreach tab.
 *
 * The response shape is treated defensively. n8n nodes commonly answer with a
 * bare object, a single-element array of one, or a plain string, and which one
 * you get depends on how the workflow's final node is configured — none of
 * which is worth a support ticket, so all three are accepted.
 */

export interface DraftReplyRequest {
  leadId: number;
  clientId: string | null;
  conversationText: string;
}

export interface DraftReplyResult {
  reply: string | null;
  error: FriendlyError | null;
}

/** Keys the workflow might have used for the drafted text. */
const REPLY_FIELDS = ['reply_draft', 'draft_reply', 'reply', 'draft', 'message', 'text', 'output'];

function fail(message: string, hint: string | null = null): DraftReplyResult {
  return { reply: null, error: { message, hint, code: 'DRAFT_REPLY' } };
}

/** Pull the drafted text out of whatever the workflow answered with. */
function extractReply(payload: unknown, depth = 0): string | null {
  if (depth > 3) return null;

  if (typeof payload === 'string') {
    const text = payload.trim();
    return text ? text : null;
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const found = extractReply(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const field of REPLY_FIELDS) {
      const value = record[field];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    // n8n wraps node output in `json` / `data` often enough to be worth a hop.
    for (const wrapper of ['json', 'data', 'body', 'result']) {
      if (wrapper in record) {
        const found = extractReply(record[wrapper], depth + 1);
        if (found) return found;
      }
    }
  }

  return null;
}

export async function requestReplyDraft({
  leadId,
  clientId,
  conversationText,
}: DraftReplyRequest): Promise<DraftReplyResult> {
  let response: Response;

  try {
    response = await fetch(DRAFT_REPLY_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        client_id: clientId,
        conversation_text: conversationText,
      }),
    });
  } catch (cause) {
    return fail(
      'The drafting service could not be reached.',
      `Check your connection and try again. Details: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }

  const raw = (await response.text().catch(() => '')).trim();

  if (!response.ok) {
    return fail(
      `The drafting service returned ${response.status}.`,
      raw ? `Details: ${raw.slice(0, 300)}` : 'It sent no explanation back.',
    );
  }

  if (!raw) return fail('The drafting service returned an empty response.');

  let parsed: unknown = raw;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* not JSON — the raw text is treated as the draft below */
  }

  const reply = extractReply(parsed);
  if (!reply) {
    return fail(
      'The drafting service replied, but without a draft.',
      `It answered with: ${raw.slice(0, 300)}`,
    );
  }

  return { reply, error: null };
}
