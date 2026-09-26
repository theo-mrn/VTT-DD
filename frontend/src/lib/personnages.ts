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
import { api, ApiError, messageErreur } from './api';
import { useRessource } from './ressource';

export interface Personnage {
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

export interface ResumePersonnage {
  id: string;
  nom: string;
  avatarUrl: string | null;
  systeme: { id: string; version: string };
  type: string;
  creation: boolean;
  updatedAt: string;
}

/** Entrée retenue à une étape « choisir ». */
export interface EntreeChoisie {
  entree: string;
  choix?: Record<string, string[]>;
}

/** Corps d'une étape de création, selon son type (sans la version). */
export type CorpsEtape =
  | { entrees: EntreeChoisie[] }
  | { valeurs: Record<string, Valeur> }
  | { affectation?: Record<string, number> }
  | { achat: string; objet: string };

/** Ajout ou mise à jour d'une possession. */
export interface MajPossession {
  entree: string;
  rang?: number;
  actif?: boolean;
  choix?: Record<string, string[]>;
  champs?: Record<string, number | string | boolean>;
}

const chemin = (id: string, suite = '') => `/v1/characters/${encodeURIComponent(id)}${suite}`;

// ─── Lectures ────────────────────────────────────────────────────────────────

export function listerPersonnages() {
  return api<ResumePersonnage[]>('/v1/characters');
}

export function lirePersonnage(id: string) {
  return api<Personnage>(chemin(id));
}

export function creerPersonnage(corps: { systemeId: string; type: string; nom: string }) {
  return api<Personnage>('/v1/characters', { method: 'POST', body: JSON.stringify(corps) });
}

export function supprimerPersonnage(id: string) {
  return api<void>(chemin(id), { method: 'DELETE' });
}

export function lireEtapesCreation(id: string) {
  return api<EtatEtape[]>(chemin(id, '/creation'));
}

export function lireAchats(id: string) {
  return api<AchatDisponible[]>(chemin(id, '/achats'));
}

// ─── Écritures (versionnées) ─────────────────────────────────────────────────

/** Une écriture reçoit l'identifiant et la version courante, et renvoie le personnage à jour. */
export type Ecriture = (id: string, version: number) => Promise<Personnage>;

const envoyer =
  (suite: string, method: string, corps: Record<string, unknown> = {}): Ecriture =>
  (id, version) =>
    api<Personnage>(chemin(id, suite), {
      method,
      body: JSON.stringify({ version, ...corps }),
    });

export const ecritures = {
  modifier: (champs: { nom?: string; avatarUrl?: string | null }) => envoyer('', 'PATCH', champs),
  valeurs: (valeurs: Record<string, Valeur>) => envoyer('/valeurs', 'PUT', { valeurs }),
  etape: (etape: string, corps: CorpsEtape) =>
    envoyer(`/creation/${encodeURIComponent(etape)}`, 'POST', corps),
  terminer: () => envoyer('/creation/terminer', 'POST'),
  acheter: (achat: string, objet: string) => envoyer('/achats', 'POST', { achat, objet }),
  rembourser: (index: number) => envoyer('/achats/rembourser', 'POST', { index }),
  possession: (maj: MajPossession) => envoyer('/possessions', 'POST', { ...maj }),
  retirerPossession:
    (entree: string): Ecriture =>
    (id, version) =>
      api<Personnage>(chemin(id, `/possessions/${encodeURIComponent(entree)}?version=${version}`), {
        method: 'DELETE',
      }),
  repos: (attributs?: string[]) => envoyer('/repos', 'POST', attributs ? { attributs } : {}),
};

// ─── Hook ────────────────────────────────────────────────────────────────────

/** Aperçu local d'une écriture : nouvel état, ou null si le moteur la refuse. */
export type Apercu = (etat: EtatEntite) => EtatEntite | null;

interface EcritureEnAttente {
  cle: number;
  apercu?: Apercu;
}

const est409 = (e: unknown) => e instanceof ApiError && e.status === 409;

/**
 * Personnage et ses écritures. Les écritures passent une par une (chacune
 * part de la version renvoyée par la précédente) ; `etat` inclut les aperçus
 * des écritures encore en attente.
 */
export function usePersonnage(id: string) {
  const ressource = useRessource(`personnage:${id}`, () => lirePersonnage(id));
  const { donnees: personnage, modifier, recharger } = ressource;
  const courant = useRef<Personnage | undefined>(undefined);
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const compteur = useRef(0);
  const [attente, setAttente] = useState<EcritureEnAttente[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (personnage && (!courant.current || personnage.version >= courant.current.version))
      courant.current = personnage;
  }, [personnage]);

  const remplacer = useCallback(
    (p: Personnage) => {
      courant.current = p;
      modifier(() => p);
    },
    [modifier],
  );

  const ecrire = useCallback(
    (op: Ecriture, apercu?: Apercu): Promise<boolean> => {
      const cle = ++compteur.current;
      setAttente((a) => [...a, { cle, apercu }]);
      setErreur(null);
      const tache = file.current.then(async () => {
        try {
          const p = courant.current;
          if (!p) throw new Error('Personnage non chargé');
          let r: Personnage;
          try {
            r = await op(p.id, p.version);
          } catch (e) {
            if (!est409(e)) throw e;
            // Version périmée : on relit, puis on rejoue une fois sur l'état frais
            const frais = await lirePersonnage(p.id);
            remplacer(frais);
            r = await op(frais.id, frais.version);
          }
          remplacer(r);
          return true;
        } catch (e) {
          setErreur(
            est409(e)
              ? 'Le personnage a été modifié ailleurs entre-temps : la fiche a été rechargée.'
              : messageErreur(e),
          );
          if (est409(e)) void recharger();
          return false;
        } finally {
          setAttente((a) => a.filter((x) => x.cle !== cle));
        }
      });
      file.current = tache;
      return tache;
    },
    [remplacer, recharger],
  );

  const etat = useMemo(() => {
    if (!personnage) return undefined;
    return attente.reduce<EtatEntite>(
      (e, x) => (x.apercu ? (x.apercu(e) ?? e) : e),
      personnage.etat,
    );
  }, [personnage, attente]);

  return {
    personnage,
    /** État affiché : celui du serveur, plus les aperçus des écritures en attente. */
    etat,
    chargement: ressource.chargement,
    erreurChargement: ressource.erreur,
    recharger,
    ecrire,
    /** Nombre d'écritures en attente du serveur. */
    enAttente: attente.length,
    erreur,
    effacerErreur: () => setErreur(null),
  };
}

export type SuiviPersonnage = ReturnType<typeof usePersonnage>;

/**
 * Donnée lue sur le serveur pour une version précise du personnage (étapes de
 * création, achats possibles). `null` tant qu'elle ne correspond pas à la
 * version affichée : l'appelant utilise alors son calcul local.
 */
export function useLectureVersionnee<T>(
  nom: string,
  personnage: Personnage | undefined,
  enAttente: number,
  lire: (id: string) => Promise<T>,
): T | null {
  const cle = personnage && !enAttente ? `${nom}:${personnage.id}:${personnage.version}` : null;
  const r = useRessource(cle, async () => ({
    version: personnage!.version,
    donnees: await lire(personnage!.id),
  }));
  if (!personnage || enAttente || !r.donnees || r.donnees.version !== personnage.version)
    return null;
  return r.donnees.donnees;
}
