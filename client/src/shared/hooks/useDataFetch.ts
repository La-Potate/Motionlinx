import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Generic data-fetch hook that owns loading/error/data lifecycle so feature
 * components stop reimplementing it. Pass a fetcher function and dependencies.
 *
 *   const { data, error, loading, refresh } = useDataFetch(
 *     ({ signal }) => api.get('/foo', { signal }).then(r => r.data),
 *     [filter],
 *     { initial: [], enabled: Boolean(filter) }
 *   );
 *
 * The fetcher receives an `{ signal }` object so it can be aborted on unmount
 * or when deps change.
 */
type Fetcher<T> = (ctx: { signal: AbortSignal }) => Promise<T>;
type Options<T> = { initial?: T | null; enabled?: boolean };

export default function useDataFetch<T = any>(
  fetcher: Fetcher<T>,
  deps: any[] = [],
  options: Options<T> = {},
) {
  const { initial = null, enabled = true } = options;
  const [data, setData] = useState<T | null>(initial as T | null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const mountedRef = useRef(true);

  // Keep latest fetcher in a ref so we can call it from refresh without
  // re-running on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(
    async (signal: AbortSignal) => {
      try {
        setLoading(true);
        setError(null);
        const result = await fetcherRef.current({ signal });
        if (!signal?.aborted && mountedRef.current) {
          setData(result);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
        if (mountedRef.current) setError(err);
      } finally {
        if (mountedRef.current && !signal?.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    run(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    const controller = new AbortController();
    run(controller.signal);
    return () => controller.abort();
  }, [run]);

  return { data, error, loading, refresh, setData };
}
