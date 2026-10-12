'use client';

/**
 * État de table piloté par le MJ et vu de tous (minuteur, temps du monde, sondage, lignes et
 * voiles) : canal éphémère de la campagne, rien dans un service. Le MJ diffuse chaque
 * changement ; un arrivant demande l'état (`<kind>.ask`) et le MJ le lui renvoie. Seul un MJ
 * est écouté ; on ignore ses propres envois par onglet (`tab.ts`). Avec `persist`, l'état est aussi gardé sur le compte du MJ, par campagne
 * (`campaign-prefs.ts`), et revient à sa prochaine séance.
 *
 * ```ts
 * export const worldTime = createGmSharedState<WorldTime>('table.worldtime', {
 *   decode: normalizeWorldTime,
 *   persist: 'worldTime',
 * });
 * // Une fois, dans la surcouche de la fonction : worldTime.useSync();
 * // Lecture : useStore(worldTime.store, (s) => s.value) ; MJ : worldTime.set(next)
 * ```
 */
import { useEffect, useRef } from 'react';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { useCampaignEphemeral } from '@/lib/realtime';
import { useTable } from '../../contexte';
import { readCampaignPref, writeCampaignPref } from './campaign-prefs';
import { enqueue } from './outbox';
import { unwrap, wrap } from './tab';

export interface GmSharedState<T> {
  store: StoreApi<{ value: T | null }>;
  /** MJ : change l'état ici et chez tous (et l'enregistre, avec `persist`). */
  set(value: T | null): void;
  /** MJ : enregistre l'état présent (avec `persist`), sans rien diffuser. */
  save(): void;
  /** À monter une seule fois (surcouche de la fonction). */
  useSync(): void;
}

/** Le MJ rediffuse son état à ce rythme (un message perdu se rattrape tout seul). */
const HEARTBEAT_MS = 15_000;
/** Un joueur sans réponse redemande l'état à ce rythme, quelques fois. */
const ASK_RETRY_MS = 4_000;
const ASK_TRIES = 4;

export function createGmSharedState<T>(
  kind: string,
  options: {
    /** Valeur reçue (ou relue) ramenée à un état valide ; null si illisible. */
    decode(raw: unknown): T | null;
    /** Ce qui s'enregistre et voyage (défaut : l'état tel quel). */
    encode?(value: T): unknown;
    /** Ce que reçoivent les joueurs, s'il diffère (secrets du MJ retirés). Défaut : `encode`. */
    share?(value: T): unknown;
    /** Clé de l'état sur le compte du MJ, par campagne. */
    persist?: string;
  },
): GmSharedState<T> {
  const ask = `${kind}.ask`;
  const encode = options.encode ?? ((v: T) => v);
  const share = (v: T) => (options.share ? options.share(v) : encode(v));
  const store = createStore<{ value: T | null }>(() => ({ value: null }));
  let sender: ((data: unknown) => void) | null = null;
  let context: { campaignId: string; gm: boolean } | null = null;

  const save = () => {
    const value = store.getState().value;
    if (options.persist && context?.gm)
      writeCampaignPref(context.campaignId, options.persist, value === null ? null : encode(value));
  };

  return {
    store,
    save,
    set(value) {
      store.setState({ value });
      sender?.(wrap(value === null ? null : share(value)));
      save();
    },
    useSync() {
      const { campagne, gm } = useTable();
      const { send, live } = useCampaignEphemeral(campagne.id, [kind, ask], (m) => {
        const recu = unwrap(m.data);
        if (!recu) return;
        if (m.kind === ask) {
          if (gm && store.getState().value !== null) diffuser();
          return;
        }
        if (m.from.role === 'gm') {
          recuDuMj.current = true;
          store.setState({ value: recu.value == null ? null : options.decode(recu.value) });
        }
      });
      const envoi = useRef(send);
      envoi.current = send;
      const recuDuMj = useRef(false);
      /** Diffuse l'état présent (par la file : jamais deux envois dans le même instant). */
      const diffuser = () =>
        enqueue(kind, () => {
          const v = store.getState().value;
          envoi.current(kind, wrap(v === null ? null : share(v)));
        });

      useEffect(() => {
        context = { campaignId: campagne.id, gm };
        sender = (data) => enqueue(kind, () => envoi.current(kind, data));
        return () => {
          sender = null;
          context = null;
          store.setState({ value: null });
        };
      }, [campagne.id, gm]);

      // MJ : l'état gardé de sa dernière séance revient
      useEffect(() => {
        if (!gm || !options.persist) return;
        let actif = true;
        void readCampaignPref(campagne.id, options.persist).then((raw) => {
          const v = raw == null ? null : options.decode(raw);
          if (actif && v !== null && store.getState().value === null) {
            store.setState({ value: v });
            sender?.(wrap(share(v)));
          }
        });
        return () => {
          actif = false;
        };
      }, [campagne.id, gm]);

      // Arrivée d'un joueur : demander l'état en cours, et redemander tant que rien n'arrive
      useEffect(() => {
        if (!live || gm) return;
        let essais = 0;
        const demander = () => {
          if (recuDuMj.current || essais++ >= ASK_TRIES) return;
          enqueue(ask, () => envoi.current(ask, wrap(null)));
          id = setTimeout(demander, ASK_RETRY_MS);
        };
        let id = setTimeout(demander, 0);
        return () => clearTimeout(id);
      }, [live, gm]);

      // MJ en ligne : il envoie son état (il a pu arriver après les joueurs), puis le rediffuse
      // de temps en temps ; un message perdu en route se rattrape ainsi
      useEffect(() => {
        if (!live || !gm) return;
        if (store.getState().value !== null) diffuser();
        const id = setInterval(() => {
          if (store.getState().value !== null) diffuser();
        }, HEARTBEAT_MS);
        return () => clearInterval(id);
        // `diffuser` ne lit que des références : pas besoin de le suivre
      }, [live, gm]);
    },
  };
}
