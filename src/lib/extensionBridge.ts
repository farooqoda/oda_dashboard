import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Talks to the GAB browser extension (v4.16+), which also runs on this
 * dashboard's domain. The dashboard never stores the task itself: the
 * extension keeps it (per browser) and answers with the current value, so
 * what is shown here is always what LinkedIn will actually do.
 */

export const TASKS = ['post_scraper', 'comment_poster', 'lead_scraper', 'message_sender'] as const;
export type Task = (typeof TASKS)[number];

/** Tasks the extension can run today. The others are shown as "coming soon". */
export const ENABLED_TASKS: readonly Task[] = ['post_scraper', 'comment_poster', 'lead_scraper', 'message_sender'];

export type ExtensionStatus = 'checking' | 'connected' | 'missing';

interface ExtensionMessage {
  source: 'gab-extension';
  type: 'mode';
  mode: Task;
  version?: string;
}

function isExtensionMessage(data: unknown): data is ExtensionMessage {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.source === 'gab-extension' && d.type === 'mode' && TASKS.includes(d.mode as Task);
}

const DETECT_TIMEOUT_MS = 1500;

export function useExtensionTask() {
  const [status, setStatus] = useState<ExtensionStatus>('checking');
  const [task, setTask] = useState<Task | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [pending, setPending] = useState<Task | null>(null);
  const connected = useRef(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isExtensionMessage(event.data)) return;
      connected.current = true;
      setStatus('connected');
      setTask(event.data.mode);
      setVersion(event.data.version ?? null);
      setPending(null);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'gab-dashboard', type: 'hello' }, window.location.origin);

    const timer = window.setTimeout(() => {
      if (!connected.current) setStatus('missing');
    }, DETECT_TIMEOUT_MS);

    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
    };
  }, []);

  const [refused, setRefused] = useState<Task | null>(null);

  const chooseTask = useCallback((next: Task) => {
    if (!ENABLED_TASKS.includes(next)) return;
    setPending(next);
    setRefused(null);
    window.postMessage({ source: 'gab-dashboard', type: 'set-mode', mode: next }, window.location.origin);
    // An older extension ignores tasks it does not know; do not spin forever.
    window.setTimeout(() => {
      setPending((current) => {
        if (current === next) setRefused(next);
        return current === next ? null : current;
      });
    }, 2500);
  }, []);

  const recheck = useCallback(() => {
    setStatus('checking');
    connected.current = false;
    window.postMessage({ source: 'gab-dashboard', type: 'hello' }, window.location.origin);
    window.setTimeout(() => {
      if (!connected.current) setStatus('missing');
    }, DETECT_TIMEOUT_MS);
  }, []);

  return { status, task, version, pending, refused, chooseTask, recheck };
}
