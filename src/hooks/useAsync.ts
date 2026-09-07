import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncResult<T> {
  value: T | undefined;
  error: unknown;
  loading: boolean;
  /** True during a re-run that already has a previous value to keep on screen. */
  refreshing: boolean;
  refresh(): void;
}

/**
 * Runs an async load, keeps the previous value visible while it re-runs, and
 * cancels in flight work when the inputs change or the screen goes away.
 *
 * A refresh deliberately does not clear `value`: replacing a populated screen
 * with a spinner because the viewer pulled to refresh loses more than it gains.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): AsyncResult<T> {
  const [value, setValue] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const hasValue = useRef(false);
  const lastNonce = useRef(nonce);

  const refresh = useCallback(() => setNonce((current) => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    // A refresh re-runs the same query, so the current value stays on screen.
    // A dependency change is a *different* query, and showing the old answer
    // under the new heading is worse than showing a spinner.
    const isRefresh = lastNonce.current !== nonce;
    lastNonce.current = nonce;
    if (isRefresh && hasValue.current) {
      setRefreshing(true);
    } else {
      hasValue.current = false;
      setValue(undefined);
      setError(undefined);
      setLoading(true);
    }

    load(controller.signal).then(
      (result) => {
        if (cancelled) return;
        hasValue.current = true;
        setValue(result);
        setError(undefined);
        setLoading(false);
        setRefreshing(false);
      },
      (failure) => {
        if (cancelled || controller.signal.aborted) return;
        setError(failure);
        setLoading(false);
        setRefreshing(false);
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { value, error, loading, refreshing, refresh };
}
