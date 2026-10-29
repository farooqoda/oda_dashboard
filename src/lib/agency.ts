import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from './supabase';

/** Batch I3/I4: agency workspace (many client teams under one agency) and the Agency Box. */
export interface Agency {
  agency_id: string;
  name: string;
  seats: number;
  seats_used: number;
  clients: number;
  brand_name: string | null;
  logo_url: string | null;
  report_note: string | null;
}

export interface AgencyClient {
  client_id: string;
  client_name: string;
  members: number;
  invited: number;
  managers: string | null;
  invites_7d: number;
  invites_30d: number;
  accepted_30d: number;
  replies_30d: number;
  risk: number;
  watch: number;
  offline: number;
  good: number;
}

export interface AgencyPerson {
  email: string;
  user_id: string | null;
  state: 'active' | 'paused' | 'invited';
  is_manager: boolean;
  licence_status: string | null;
  ext_seen_at: string | null;
}

export interface AgencyRow {
  agency_id: string;
  name: string;
  seats: number;
  seats_used: number;
  clients: number;
  admins: string | null;
}

export interface BoxRow {
  client_id: string;
  client_name: string;
  user_id: string;
  email: string | null;
  profile_name: string | null;
  proxy_scheme: 'http' | 'https' | 'socks5';
  proxy_host: string | null;
  proxy_port: number | null;
  country: string | null;
  note: string | null;
  updated_at: string | null;
  ext_seen_at: string | null;
  ext_version: string | null;
  work_tz: string | null;
}

type Result<T> = { data: T; error: null; missing?: boolean } | { data: null; error: FriendlyError; missing?: boolean };
const notConfigured: FriendlyError = { message: supabaseConfigError ?? 'Not configured', hint: null, code: 'CONFIG' };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<Result<T>> {
  if (!supabase) return { data: null, error: notConfigured };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: toFriendlyError(error), missing: error.code === 'PGRST202' || new RegExp(fn).test(error.message) };
  return { data: data as T, error: null };
}

export const loadMyAgencies = () => rpc<Agency[]>('gab_agency_me');
export const loadAgencyClients = (agency: string) => rpc<AgencyClient[]>('gab_agency_clients', { p_agency: agency });
export const createAgencyClient = (agency: string, name: string) => rpc<string>('gab_agency_create_client', { p_agency: agency, p_name: name });
export const renameAgencyClient = (client: string, name: string) => rpc<string>('gab_agency_rename_client', { p_client: client, p_name: name });
export const loadAgencyPeople = (client: string) => rpc<AgencyPerson[]>('gab_agency_people', { p_client: client });
export const addAgencyPeople = (client: string, emails: string[], manager: string | null) =>
  rpc<{ email: string; result: string }[]>('gab_agency_add_people', { p_client: client, p_emails: emails, p_manager_email: manager });
export const agencyPersonAction = (client: string, email: string, action: 'pause' | 'resume' | 'cancel_invite' | 'make_manager' | 'remove_manager') =>
  rpc<string>('gab_agency_person', { p_client: client, p_email: email, p_action: action });
export const setAgencyBrand = (agency: string, brand: string, logo: string, note: string) =>
  rpc<string>('gab_agency_set_brand', { p_agency: agency, p_brand_name: brand, p_logo_url: logo, p_report_note: note });
export const loadAgenciesList = () => rpc<AgencyRow[]>('gab_agencies_list');
export const upsertAgency = (id: string, name: string, seats: number, adminEmail: string) =>
  rpc<string>('gab_agency_upsert', { p_agency: id, p_name: name, p_seats: seats, p_admin_email: adminEmail || null });

export const loadBox = (client: string | null) => rpc<BoxRow[]>('gab_box_list', { p_client: client });
export const loadSharedProxies = () => rpc<{ proxy: string; accounts: number; emails: string }[]>('gab_box_shared_proxies');
export const saveBox = (r: { user_id: string; profile_name: string; proxy_scheme: string; proxy_host: string; proxy_port: number | null; country: string; note: string }) =>
  rpc<string>('gab_box_save', {
    p_user: r.user_id,
    p_profile_name: r.profile_name,
    p_scheme: r.proxy_scheme,
    p_host: r.proxy_host,
    p_port: r.proxy_port,
    p_country: r.country,
    p_note: r.note,
  });

/** Split a pasted list (commas, spaces, new lines, semicolons) into emails. */
export function parseEmailList(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Agency Box launcher files
// ---------------------------------------------------------------------------
const SAFE_NAME = /[^A-Za-z0-9 _.-]+/g;

/** A Chrome profile folder name that is safe in a .bat and a shell script. */
export function safeProfileName(s: string): string {
  return s.replace(SAFE_NAME, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Account';
}

export function defaultProfileName(r: Pick<BoxRow, 'client_name' | 'email' | 'user_id'>): string {
  const who = (r.email ?? r.user_id).split('@')[0];
  return safeProfileName(`${r.client_name} - ${who}`);
}

export interface LaunchAccount {
  name: string; // profile folder name (safe)
  proxy: string | null; // e.g. socks5://203.0.113.7:1080
  label: string; // shown in the menu
}

export function launchAccounts(rows: BoxRow[]): LaunchAccount[] {
  const used = new Set<string>();
  return rows.map((r) => {
    let name = safeProfileName(r.profile_name || defaultProfileName(r));
    let n = 2;
    const base = name;
    while (used.has(name.toLowerCase())) name = safeProfileName(`${base.slice(0, 36)} ${n++}`);
    used.add(name.toLowerCase());
    const host = r.proxy_host && /^[a-z0-9.-]{1,253}$/i.test(r.proxy_host) ? r.proxy_host : null;
    const port = r.proxy_port && r.proxy_port >= 1 && r.proxy_port <= 65535 ? r.proxy_port : null;
    const scheme = ['http', 'https', 'socks5'].includes(r.proxy_scheme) ? r.proxy_scheme : 'http';
    const proxy = host && port ? `${scheme}://${host}:${port}` : null;
    const via = host && port ? `${scheme} ${host} port ${port}` : 'no proxy';
    return { name, proxy, label: `${name}  -  ${via}`.replace(SAFE_NAME, ' ') };
  });
}

const LINKEDIN = 'https://www.linkedin.com/feed/';
const IPCHECK = 'https://ipinfo.io/';
const FLAGS = '--no-first-run --no-default-browser-check';
const WEBRTC = '--force-webrtc-ip-handling-policy=disable_non_proxied_udp';

/** Windows: a .bat with a menu. Double-click to run. */
export function windowsLauncher(accounts: LaunchAccount[]): string {
  const L: string[] = [
    '@echo off',
    'setlocal',
    'title Impact Connect - Agency Box',
    'rem Made by the Impact Connect dashboard. Every account opens in its own Chrome profile through its own proxy.',
    'set "CHROME=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" set "CHROME=%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" (',
    '  echo Google Chrome was not found on this computer. Install Chrome and try again.',
    '  pause',
    '  exit /b 1',
    ')',
    'set "BOX=%LocalAppData%\\ImpactConnectBox"',
    ':menu',
    'cls',
    'echo  Impact Connect - Agency Box',
    'echo  ---------------------------',
    ...accounts.map((a, i) => `echo   ${i + 1}. ${a.label}`),
    'echo   A. Open all accounts',
    'echo   Q. Quit',
    'echo.',
    'set "pick="',
    'set /p pick=Choose a number: ',
    ...accounts.map((a, i) => `if /i "%pick%"=="${i + 1}" call :open "${a.name}" "${a.proxy ?? ''}"`),
    'if /i "%pick%"=="A" (',
    ...accounts.map((a) => `  call :open "${a.name}" "${a.proxy ?? ''}"`),
    `  timeout /t 1 >nul`,
    ')',
    'if /i "%pick%"=="Q" exit /b 0',
    'goto menu',
    '',
    ':open',
    'set "DIR=%BOX%\\%~1"',
    'if "%~2"=="" (',
    `  start "" "%CHROME%" --user-data-dir="%DIR%" ${FLAGS} "${LINKEDIN}"`,
    ') else (',
    `  start "" "%CHROME%" --user-data-dir="%DIR%" --proxy-server="%~2" ${WEBRTC} ${FLAGS} "${LINKEDIN}" "${IPCHECK}"`,
    ')',
    'exit /b 0',
    '',
  ];
  return L.join('\r\n');
}

/** Mac: a .command (bash) with a menu. */
export function macLauncher(accounts: LaunchAccount[]): string {
  const q = (s: string) => `'${s.replace(/'/g, '')}'`;
  return [
    '#!/bin/bash',
    '# Made by the Impact Connect dashboard. Every account opens in its own Chrome profile through its own proxy.',
    'CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"',
    '[ -x "$CHROME" ] || CHROME="$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"',
    'if [ ! -x "$CHROME" ]; then echo "Google Chrome was not found. Install Chrome and try again."; read -r -p "Press Enter to close"; exit 1; fi',
    'BOX="$HOME/Library/Application Support/ImpactConnectBox"',
    'open_one() {',
    '  local dir="$BOX/$1"; mkdir -p "$dir"',
    '  if [ -n "$2" ]; then',
    `    nohup "$CHROME" --user-data-dir="$dir" --proxy-server="$2" ${WEBRTC} ${FLAGS} "${LINKEDIN}" "${IPCHECK}" >/dev/null 2>&1 &`,
    '  else',
    `    nohup "$CHROME" --user-data-dir="$dir" ${FLAGS} "${LINKEDIN}" >/dev/null 2>&1 &`,
    '  fi',
    '}',
    'while true; do',
    '  clear',
    '  echo " Impact Connect - Agency Box"',
    '  echo " ---------------------------"',
    ...accounts.map((a, i) => `  echo "  ${i + 1}. ${a.label}"`),
    '  echo "  A. Open all accounts"',
    '  echo "  Q. Quit"',
    '  echo',
    '  read -r -p "Choose a number: " pick',
    '  case "$pick" in',
    ...accounts.map((a, i) => `    ${i + 1}) open_one ${q(a.name)} ${q(a.proxy ?? '')} ;;`),
    `    [Aa]) ${accounts.map((a) => `open_one ${q(a.name)} ${q(a.proxy ?? '')}; sleep 1`).join('; ') || 'true'} ;;`,
    '    [Qq]) exit 0 ;;',
    '  esac',
    'done',
    '',
  ].join('\n');
}

export function download(filename: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
