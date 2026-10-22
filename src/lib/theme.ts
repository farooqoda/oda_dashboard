/** Light / dark theme. The choice is kept in this browser; "system" follows the computer's setting. */
export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'ic-theme';

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage blocked: follow the system */
  }
  return 'system';
}

function systemDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export function resolvedTheme(choice: ThemeChoice = getThemeChoice()): 'light' | 'dark' {
  return choice === 'system' ? (systemDark() ? 'dark' : 'light') : choice;
}

export function applyTheme(choice: ThemeChoice = getThemeChoice()) {
  const dark = resolvedTheme(choice) === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', dark ? 'dark' : 'light');
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* not remembered, still applied now */
  }
  applyTheme(choice);
  window.dispatchEvent(new CustomEvent('ic-theme', { detail: choice }));
}

/** Follow the computer's setting while the choice is "system". */
export function watchSystemTheme() {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getThemeChoice() === 'system') applyTheme('system');
    });
  } catch {
    /* old browser */
  }
}
