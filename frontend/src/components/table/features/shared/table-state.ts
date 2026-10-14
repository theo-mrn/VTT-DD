'use client';

/**
 * État des outils de la table, gardé par le service campaign (docs/automatismes.md § 4) : heure
 * du monde, horloges, minuteur, jetons de destin, ambiance d'écran, pause. Une seule copie par
 * onglet (`tableStateStore`), tenue à jour par `table_state.updated` (joueurs) ou
 * `table_state.gm_updated` (MJ) ; chaque outil en lit sa tranche (`createTableSlice`), avec la
 * même interface que l'état partagé du MJ (`gm-state.ts`) : `store`, `set`, `useSync`.
 *
 * Instants : ceux du serveur (`anchorAt`, `endsAt`), ramenés à l'horloge locale par l'écart
 * mesuré à chaque réception (`serverTime`).
 */
import { TABLE_STATE_PERSONAL, type TableState, type UpdateTableState } from '@vtt/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { translate } from '@/i18n/runtime';
import { api, messageErreur } from '@/lib/api';
import { personalWeather } from '@/lib/map/features/weather/engine/state';
import { useCampaignEvents } from '@/lib/realtime';
import { useTable } from '../../contexte';

const url = (campaignId: string, rest = '') =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}${rest}`;

export const tableStateApi = {
  get: (campaignId: string) => api<TableState>(url(campaignId, '/table-state')),
  patch: (campaignId: string, body: UpdateTableState) =>
    api<TableState>(url(campaignId, '/table-state'), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  spendFate: (campaignId: string) =>
    api<TableState>(url(campaignId, '/table-state/fate/spend'), { method: 'POST' }),
  playFx: (campaignId: string, effect: string, userIds?: readonly string[]) =>
    api<void>(url(campaignId, '/table-fx'), {
      method: 'POST',
      body: JSON.stringify(userIds?.length ? { effect, userIds } : { effect }),
    }),
};

interface Store {
  campaignId: string | null;
  state: TableState | null;
  /** Horloge locale moins horloge du serveur (ms). */
  offset: number;
}

export const tableStateStore = createStore<Store>(() => ({
  campaignId: null,
  state: null,
  offset: 0,
}));

/** Instant du serveur → horloge locale. */
export const toLocal = (iso: string) => Date.parse(iso) + tableStateStore.getState().offset;

/** Adopte un état reçu (réponse ou événement), sauf s'il est plus ancien que celui qu'on a. */
export function adoptTableState(campaignId: string, s: TableState) {
  const cur = tableStateStore.getState();
  if (cur.campaignId === campaignId && cur.state && s.version < cur.state.version) return;
  tableStateStore.setState({
    campaignId,
    state: s,
    offset: Date.now() - Date.parse(s.serverTime),
  });
}

/** MJ : change une ou plusieurs clés ; l'état renvoyé fait foi. */
export async function patchTableState(changes: UpdateTableState) {
  const { campaignId } = tableStateStore.getState();
  if (!campaignId) return;
  try {
    adoptTableState(campaignId, await tableStateApi.patch(campaignId, changes));
  } catch (e) {
    toast.error(translate('table.state.saveFailed'), { description: messageErreur(e) });
  }
}

const key = (campaignId: string) => ['campaign', campaignId, 'table-state'] as const;

/** Tient l'état à jour pour l'onglet ; monté une fois (hôte des surcouches), appelable partout. */
export function useTableStateSync() {
  const { campagne, gm } = useTable();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: key(campagne.id),
    queryFn: () => tableStateApi.get(campagne.id),
  });
  useEffect(() => {
    if (q.data) adoptTableState(campagne.id, q.data);
  }, [q.data, campagne.id]);
  useEffect(() => {
    tableStateStore.setState({ campaignId: campagne.id });
    return () => tableStateStore.setState({ campaignId: null, state: null });
  }, [campagne.id]);
  const { generation } = useCampaignEvents(
    campagne.id,
    [gm ? 'table_state.gm_updated' : 'table_state.updated'],
    (e) => {
      const s = e.event.payload as unknown as TableState;
      // La vue publique ne porte pas l'ambiance d'un joueur : on garde la sienne
      const cur = tableStateStore.getState().state;
      adoptTableState(
        campagne.id,
        gm
          ? s
          : {
              ...s,
              personalMood: cur?.personalMood ?? null,
              personalWeather: cur?.personalWeather ?? null,
            },
      );
    },
  );
  // Joueur : son ambiance à lui a changé (reçue par lui seul)
  useCampaignEvents(campagne.id, [TABLE_STATE_PERSONAL], (e) => {
    if (gm) return;
    const p = e.event.payload as {
      mood?: TableState['personalMood'];
      weather?: TableState['personalWeather'];
    };
    const cur = tableStateStore.getState();
    if (cur.state)
      tableStateStore.setState({
        state: {
          ...cur.state,
          personalMood: p.mood ?? null,
          personalWeather: p.weather ?? null,
        },
      });
  });
  // Joueur : sa météo à lui, passée à la carte (elle passe devant celle de la scène)
  useEffect(() => {
    const pousser = (s: TableState | null) =>
      personalWeather.setState({
        weather: !gm && s?.personalWeather ? s.personalWeather.weather : undefined,
      });
    pousser(tableStateStore.getState().state);
    const stop = tableStateStore.subscribe((x, avant) => {
      if (x.state?.personalWeather !== avant.state?.personalWeather) pousser(x.state);
    });
    return () => {
      stop();
      personalWeather.setState({ weather: undefined });
    };
  }, [gm]);
  // Message d'un automatisme (à toute la table, ou au MJ seul : filtré par le serveur)
  useCampaignEvents(campagne.id, ['automation.notice'], (e) => {
    const { text } = e.event.payload as { text?: unknown };
    if (typeof text === 'string' && text) toast(text, { duration: 8000 });
  });
  // Reconnexion sans rejeu : relire l'état
  useEffect(() => {
    if (generation > 0) void qc.invalidateQueries({ queryKey: key(campagne.id) });
  }, [generation, qc, campagne.id]);
}

export interface TableSlice<T> {
  store: StoreApi<{ value: T | null }>;
  /** MJ : change la valeur (tout de suite ici, puis au serveur). */
  set(value: T | null): void;
  /** Rien à faire : l'état vit au serveur (gardé pour l'interface commune). */
  save(): void;
  /** L'état se tient à jour (hôte des surcouches) ; gardé pour l'interface commune. */
  useSync(): void;
}

/** Une tranche de l'état : sa lecture (instants ramenés à l'horloge locale) et son écriture. */
export function createTableSlice<T>(
  read: (s: TableState) => T | null,
  write: (value: T | null) => UpdateTableState,
): TableSlice<T> {
  const store = createStore<{ value: T | null }>(() => ({ value: null }));
  tableStateStore.subscribe((s, avant) => {
    if (s.state !== avant.state || s.offset !== avant.offset)
      store.setState({ value: s.state ? read(s.state) : null });
  });
  return {
    store,
    set(value) {
      store.setState({ value });
      void patchTableState(write(value));
    },
    save() {},
    useSync() {},
  };
}
