import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../utils/api.js';

/**
 * Minimal GET-and-cache-in-state hook.
 *
 * A data library (React Query et al) would be overkill here: the app has three read
 * endpoints, no cross-view cache invalidation, and lesson content is already cached
 * server-side once enriched. This keeps the dependency list short and the data flow
 * obvious.
 *
 * Requests are aborted on unmount/URL change so navigating away mid-generation can't
 * write into a stale component.
 */
export function useFetch(url, { enabled = true, params } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled && url));
  const [reloadToken, setReloadToken] = useState(0);

  const paramsKey = params ? JSON.stringify(params) : '';
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !url) {
      setLoading(false);
      return undefined;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    api
      .get(url, { params, signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setData(res.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        // A cancelled request is not a failure — the component moved on.
        if (controller.signal.aborted || err.name === 'CanceledError') return;
        setError(err);
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- params compared by value via paramsKey
  }, [url, enabled, paramsKey, reloadToken]);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, error, loading, refetch, setData };
}

export default useFetch;
