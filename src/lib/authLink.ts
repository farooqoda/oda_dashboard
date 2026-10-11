import { initialAuthUrl } from './supabase';

/**
 * What an emailed Supabase link carried when it opened this page.
 *
 * - `isRecovery`: a password-reset link that already signed the browser in
 *   (the classic `#access_token=…&type=recovery` link).
 * - `tokenHash`: the newer, scanner-proof link
 *   (`/reset-password?token_hash=…&type=recovery`). Nothing is used up until
 *   the person presses the button, so email security scanners that open links
 *   on their own (common with Microsoft 365) cannot spend it first.
 * - `errorCode` / `errorDescription`: the link failed, usually `otp_expired` —
 *   it was too old or had already been opened once.
 */
export interface AuthLinkInfo {
  isRecovery: boolean;
  tokenHash: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

export function readAuthLink(): AuthLinkInfo {
  const hash = new URLSearchParams(initialAuthUrl.hash.replace(/^#/, ''));
  const query = new URLSearchParams(initialAuthUrl.search);
  const type = hash.get('type') ?? query.get('type');
  const tokenHash = query.get('token_hash');
  return {
    isRecovery: type === 'recovery' && hash.has('access_token'),
    tokenHash: tokenHash && type === 'recovery' ? tokenHash : null,
    errorCode: hash.get('error_code') ?? query.get('error_code') ?? hash.get('error') ?? query.get('error'),
    errorDescription: hash.get('error_description') ?? query.get('error_description'),
  };
}
