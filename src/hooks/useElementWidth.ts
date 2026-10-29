import { useCallback, useEffect, useState } from 'react';

/**
 * Measured width of a container, so SVG charts can lay out in real pixels
 * instead of being stretched by preserveAspectRatio (which would distort text).
 * A callback ref, so it also measures a container that appears later
 * (e.g. a chart that had no data at first).
 */
export function useElementWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((n: T | null) => setNode(n), []);

  useEffect(() => {
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, width] as const;
}
