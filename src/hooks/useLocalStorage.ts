import { useCallback, useEffect, useState } from 'react';

/**
 * State mirrored into localStorage. Used for column visibility, which has to
 * survive a reload. Storage failures (private mode, quota) degrade to plain
 * in-memory state rather than breaking the screen.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — keep going with in-memory state */
    }
  }, [key, value]);

  const reset = useCallback(() => setValue(initial), [initial]);

  return [value, setValue, reset] as const;
}
