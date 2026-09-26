/**
 * Personnages (service character), selon le contrat de docs/api-character.md.
 *
 * Chaque écriture envoie la `version` connue du personnage ; un 409 veut dire
 * qu'elle est périmée : on relit le personnage et on rejoue l'écriture une fois.
 * Pendant l'attente du serveur, la fiche est recalculée localement avec le
 * même moteur (`@vtt/rules`) à partir d'un aperçu de l'état : l'affichage est
 * immédiat, puis remplacé par la réponse du serveur, qui fait autorité.
 */
'use client';

import type { AchatDisponible, EtatEntite, EtatEtape, FicheJson, Valeur } from '@vtt/rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from './api';
import { useResource } from './resource';

export interface Character {
  id: string;
  ownerId: string;
  nom: string;
  avatarUrl: string | null;
  etat: EtatEntite;
  fiche: FicheJson;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterSummary {
  id: string;
  nom: string;
  avatarUrl: string | null;
  systeme: { id: string; version: string };
  type: string;
  creation: boolean;
  updatedAt: string;
}

/** Entrée retenue à une étape « choisir ». */
export interface ChosenEntry {
  entree: string;
  choix?: Record<string, string[]>;
}

/** Corps d'une étape de création, selon son type (sans la version). */
export type StepBody =
  | { entrees: ChosenEntry[] }
  | { valeurs: Record<string, Valeur> }
  | { affectation?: Record<string, number> }
  | { achat: string; objet: string };

/** Ajout ou mise à jour d'une possession. */
export interface PossessionUpdate {
  entree: string;
  rang?: number;
  actif?: boolean;
  choix?: Record<string, string[]>;
  champs?: Record<string, number | string | boolean>;
}

const path = (id: string, suffix = '') => `/v1/characters/${encodeURIComponent(id)}${suffix}`;

// ─── Lectures ────────────────────────────────────────────────────────────────

export function listCharacters() {
  return api<CharacterSummary[]>('/v1/characters');
}

export function getCharacter(id: string) {
  return api<Character>(path(id));
}

export function createCharacter(body: { systemeId: string; type: string; nom: string }) {
  return api<Character>('/v1/characters', { method: 'POST', body: JSON.stringify(body) });
}

export function deleteCharacter(id: string) {
  return api<void>(path(id), { method: 'DELETE' });
}

export function getCreationSteps(id: string) {
  return api<EtatEtape[]>(path(id, '/creation'));
}

export function getPurchases(id: string) {
  return api<AchatDisponible[]>(path(id, '/achats'));
}

// ─── Écritures (versionnées) ─────────────────────────────────────────────────

/** Une écriture reçoit l'identifiant et la version courante, et renvoie le personnage à jour. */
export type Write = (id: string, version: number) => Promise<Character>;

const send =
  (suffix: string, method: string, body: Record<string, unknown> = {}): Write =>
  (id, version) =>
    api<Character>(path(id, suffix), {
      method,
      body: JSON.stringify({ version, ...body }),
    });

export const writes = {
  update: (fields: { nom?: string; avatarUrl?: string | null }) => send('', 'PATCH', fields),
  values: (values: Record<string, Valeur>) => send('/valeurs', 'PUT', { valeurs: values }),
  step: (step: string, body: StepBody) =>
    send(`/creation/${encodeURIComponent(step)}`, 'POST', body),
  finish: () => send('/creation/terminer', 'POST'),
  buy: (purchase: string, item: string) =>
    send('/achats', 'POST', { achat: purchase, objet: item }),
  refund: (index: number) => send('/achats/rembourser', 'POST', { index }),
  possession: (update: PossessionUpdate) => send('/possessions', 'POST', { ...update }),
  removePossession:
    (entry: string): Write =>
    (id, version) =>
      api<Character>(path(id, `/possessions/${encodeURIComponent(entry)}?version=${version}`), {
        method: 'DELETE',
      }),
  rest: (attributes?: string[]) =>
    send('/repos', 'POST', attributes ? { attributs: attributes } : {}),
};

// ─── Hook ────────────────────────────────────────────────────────────────────

/** Aperçu local d'une écriture : nouvel état, ou null si le moteur la refuse. */
export type Preview = (state: EtatEntite) => EtatEntite | null;

interface PendingWrite {
  key: number;
  preview?: Preview;
}

const is409 = (e: unknown) => e instanceof ApiError && e.status === 409;

/**
 * Personnage et ses écritures. Les écritures passent une par une (chacune
 * part de la version renvoyée par la précédente) ; `etat` inclut les aperçus
 * des écritures encore en attente.
 */
export function useCharacter(id: string) {
  const resource = useResource(`personnage:${id}`, () => getCharacter(id));
  const { data: character, update, reload } = resource;
  const latest = useRef<Character | undefined>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const counter = useRef(0);
  const [pendingWrites, setPendingWrites] = useState<PendingWrite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (character && (!latest.current || character.version >= latest.current.version))
      latest.current = character;
  }, [character]);

  const replace = useCallback(
    (p: Character) => {
      latest.current = p;
      update(() => p);
    },
    [update],
  );

  const write = useCallback(
    (op: Write, preview?: Preview): Promise<boolean> => {
      const key = ++counter.current;
      setPendingWrites((a) => [...a, { key, preview }]);
      setError(null);
      const task = queue.current.then(async () => {
        try {
          const p = latest.current;
          if (!p) throw new Error('Personnage non chargé');
          let r: Character;
          try {
            r = await op(p.id, p.version);
          } catch (e) {
            if (!is409(e)) throw e;
            // Version périmée : on relit, puis on rejoue une fois sur l'état frais
            const fresh = await getCharacter(p.id);
            replace(fresh);
            r = await op(fresh.id, fresh.version);
          }
          replace(r);
          return true;
        } catch (e) {
          setError(
            is409(e)
              ? 'Le personnage a été modifié ailleurs entre-temps : la fiche a été rechargée.'
              : errorMessage(e),
          );
          if (is409(e)) void reload();
          return false;
        } finally {
          setPendingWrites((a) => a.filter((x) => x.key !== key));
        }
      });
      queue.current = task;
      return task;
    },
    [replace, reload],
  );

  const state = useMemo(() => {
    if (!character) return undefined;
    return pendingWrites.reduce<EtatEntite>(
      (e, x) => (x.preview ? (x.preview(e) ?? e) : e),
      character.etat,
    );
  }, [character, pendingWrites]);

  return {
    personnage: character,
    /** État affiché : celui du serveur, plus les aperçus des écritures en attente. */
    etat: state,
    loading: resource.loading,
    loadError: resource.error,
    reload,
    write,
    /** Nombre d'écritures en attente du serveur. */
    pending: pendingWrites.length,
    error,
    clearError: () => setError(null),
  };
}

export type CharacterTracker = ReturnType<typeof useCharacter>;

/**
 * Donnée lue sur le serveur pour une version précise du personnage (étapes de
 * création, achats possibles). `null` tant qu'elle ne correspond pas à la
 * version affichée : l'appelant utilise alors son calcul local.
 */
export function useVersionedRead<T>(
  name: string,
  character: Character | undefined,
  pending: number,
  read: (id: string) => Promise<T>,
): T | null {
  const key = character && !pending ? `${name}:${character.id}:${character.version}` : null;
  const r = useResource(key, async () => ({
    version: character!.version,
    data: await read(character!.id),
  }));
  if (!character || pending || !r.data || r.data.version !== character.version) return null;
  return r.data.data;
}
