import { useEffect, useState } from 'react';

/**
 * Mirrors `value`, but the echo lags behind by `delayMs`. Used for the leads
 * search box: the input itself updates every keystroke so typing feels
 * instant, while the value that actually drives filtering — and therefore a
 * re-render of up to MAX_ROWS rows — only catches up once typing pauses.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
