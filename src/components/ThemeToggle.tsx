import { useEffect, useState } from 'react';
import { getThemeChoice, resolvedTheme, setThemeChoice, type ThemeChoice } from '../lib/theme';

export function useThemeChoice(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(getThemeChoice());
  useEffect(() => {
    const on = (e: Event) => setChoice((e as CustomEvent<ThemeChoice>).detail);
    window.addEventListener('ic-theme', on);
    return () => window.removeEventListener('ic-theme', on);
  }, []);
  return [choice, setThemeChoice];
}

/** Top bar: one click switches between light and dark. */
export function ThemeToggle() {
  const [choice, set] = useThemeChoice();
  const dark = resolvedTheme(choice) === 'dark';
  return (
    <button
      type="button"
      onClick={() => set(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      // on phones the theme is in the account menu (the bar has no room)
      className="hidden h-11 w-11 items-center justify-center rounded-full bg-white/70 text-lg sm:inline-flex"
    >
      <span aria-hidden="true">{dark ? '☀️' : '🌙'}</span>
    </button>
  );
}

/** Account menu / Settings: Light, Dark, or follow the computer. */
export function ThemeChooser() {
  const [choice, set] = useThemeChoice();
  const opts: Array<[ThemeChoice, string]> = [
    ['light', 'Light'],
    ['dark', 'Dark'],
    ['system', 'Auto'],
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs">
      {opts.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={choice === v}
          onClick={() => set(v)}
          className={`flex-1 rounded-full px-3 py-1 ${choice === v ? 'bg-ink font-medium text-white' : 'text-slate-700 hover:bg-slate-200'}`}
          title={v === 'system' ? 'Follow your computer’s setting' : undefined}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
