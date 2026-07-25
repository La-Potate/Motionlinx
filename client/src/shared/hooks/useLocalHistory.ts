import { useCallback, useEffect, useState } from 'react';

/**
 * localStorage-backed list of recent items. Replaces the hand-rolled
 * read/persist patterns in GoogleBusinessAudit (`gba-history`), LocalResearch
 * (`lr-history-<userId>`), etc.
 *
 *   const { history, add, remove, clear } = useLocalHistory('gba-history', { max: 25 });
 */
type HistoryOptions<T> = { max?: number; dedupeBy?: (item: T) => unknown };

export default function useLocalHistory<T = any>(
  storageKey: string,
  options: HistoryOptions<T> = {},
) {
  const { max = 25, dedupeBy } = options;

  const read = useCallback((): T[] => {
    if (typeof window === 'undefined' || !storageKey) return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const [history, setHistory] = useState<T[]>(read);

  // Sync when the key changes.
  useEffect(() => {
    setHistory(read());
  }, [read]);

  const persist = useCallback(
    (next: T[]) => {
      if (typeof window === 'undefined' || !storageKey) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore quota errors etc
      }
    },
    [storageKey],
  );

  const add = useCallback(
    (item: T) => {
      setHistory((prev) => {
        const filtered = dedupeBy
          ? prev.filter((existing) => dedupeBy(existing) !== dedupeBy(item))
          : prev;
        const next = [item, ...filtered].slice(0, max);
        persist(next);
        return next;
      });
    },
    [dedupeBy, max, persist],
  );

  const remove = useCallback(
    (predicate: (item: T) => boolean) => {
      setHistory((prev) => {
        const next = prev.filter((entry) => !predicate(entry));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const clear = useCallback(() => {
    persist([]);
    setHistory([]);
  }, [persist]);

  return { history, add, remove, clear, setHistory };
}
