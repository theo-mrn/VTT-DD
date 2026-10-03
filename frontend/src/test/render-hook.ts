/**
 * Rendu d'un hook React dans jsdom, sans dépendance de test (tests seulement) : un composant
 * monté par `react-dom/client` sous un `QueryClient` neuf, le résultat relu après chaque rendu.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

export async function renderHook<T>(hook: () => T, client = testQueryClient()) {
  const result: { current: T } = { current: undefined as T };
  function Probe(): ReactNode {
    result.current = hook();
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(Probe)));
  });
  return {
    result,
    client,
    /** Attend que `check` passe (requêtes résolues, rendus faits). */
    async waitFor(check: () => void, timeout = 2_000) {
      const start = Date.now();
      for (;;) {
        try {
          check();
          return;
        } catch (err) {
          if (Date.now() - start > timeout) throw err;
          await act(async () => {
            await new Promise((r) => setTimeout(r, 10));
          });
        }
      }
    },
    /** Exécute une action qui fait rendre (mutation, invalidation). */
    act: <R>(fn: () => Promise<R> | R) => act(async () => fn()) as Promise<R>,
    unmount: () => act(() => root.unmount()),
  };
}
