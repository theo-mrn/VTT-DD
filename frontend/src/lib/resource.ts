'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

export interface Resource<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload(): Promise<void>;
  /** Mise à jour locale (après une action), sans nouvel appel. */
  update(patch: (current: T | undefined) => T | undefined): void;
}

/**
 * Charge une ressource de l'API et suit son état. `cle` identifie la requête :
 * elle est relancée quand la clé change, et rien n'est chargé si elle vaut null.
 */
export function useResource<T>(key: string | null, load: () => Promise<T>): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const loaderRef = useRef(load);
  const lastRequest = useRef(0);

  useEffect(() => {
    loaderRef.current = load;
  });

  const reload = useCallback(async () => {
    if (key === null) return;
    const requestId = ++lastRequest.current;
    setLoading(true);
    try {
      const d = await loaderRef.current();
      if (requestId !== lastRequest.current) return;
      setData(d);
      setError(null);
    } catch (err) {
      if (requestId !== lastRequest.current) return;
      setError(errorMessage(err));
    } finally {
      if (requestId === lastRequest.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback((patch: (current: T | undefined) => T | undefined) => {
    setData((d) => patch(d));
  }, []);

  return { data, error, loading, reload, update };
}
