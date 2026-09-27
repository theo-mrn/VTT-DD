/**
 * Jets de dés : formules évaluées par @vtt/rules (`2d20k1 + 5`, `4d6k3`,
 * `1d6!`, `@FOR` avec un personnage), historique et macros.
 *
 * Le résultat est tiré par un générateur cryptographique, ou imposé (dés
 * physiques lancés en 3D). Le service character fera autorité sur les jets
 * de partie ; en attendant, l'historique est local au navigateur.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aleatoireCrypto,
  aleatoireImpose,
  analyser,
  evaluer,
  type ContexteEvaluation,
  type Fiche,
  type JetDes,
} from '@vtt/rules';
import { api } from './api';
import {
  lireCollection,
  maintenant,
  modifierCollection,
  nouvelId,
  serviceActif,
  utilisateurLocal,
} from './depot-local';

export type VisibiliteJet = 'public' | 'private' | 'gm';
export type Critique = 'success' | 'failure' | null;

export interface GroupeDes {
  faces: number;
  dice: { value: number; kept: boolean; exploded: boolean }[];
  total: number;
}

export interface Jet {
  id: string;
  formula: string;
  label: string | null;
  total: number;
  groups: GroupeDes[];
  critical: Critique;
  visibility: VisibiliteJet;
  roomId: string | null;
  characterId: string | null;
  characterName: string | null;
  userId: string;
  userName: string;
  userAvatar: string | null;
  createdAt: string;
}

export interface Macro {
  id: string;
  name: string;
  formula: string;
}

export const DES_RAPIDES = [4, 6, 8, 10, 12, 20, 100] as const;

// ─── Formules ────────────────────────────────────────────────────────────────

/** Écritures courantes acceptées : `D20`, `d%`, `kh` (garder le meilleur). */
export function normaliserFormule(texte: string): string {
  return texte
    .trim()
    .replace(/(\d*)D(\d+|%)/g, '$1d$2')
    .replace(/d%/g, 'd100')
    .replace(/kh(\d)/g, 'k$1');
}

function contexte(fiche: Fiche | null | undefined, aleatoire: ContexteEvaluation['aleatoire']) {
  if (fiche) return fiche.contexte({ aleatoire });
  const inconnu = (quoi: string) => () => {
    throw new Error(`${quoi} : choisissez un personnage pour utiliser ses valeurs`);
  };
  return {
    attribut: inconnu('Attribut'),
    modificateur: inconnu('Modificateur'),
    variable: (nom: string) => {
      throw new Error(`Terme inconnu : « ${nom} »`);
    },
    aleatoire,
  } satisfies ContexteEvaluation;
}

export type Verification = { ok: true } | { ok: false; message: string; position: number | null };

/** Vérifie une formule sans la lancer pour de vrai (dés tirés avec une graine fixe). */
export function verifierFormule(texte: string, fiche?: Fiche | null): Verification {
  const f = normaliserFormule(texte);
  if (!f) return { ok: false, message: 'Formule vide', position: null };
  const a = analyser(f);
  if (!a.ok) return { ok: false, message: a.erreur.message, position: a.erreur.position };
  try {
    const r = evaluer(a.noeud, contexte(fiche, aleatoireCrypto()));
    if (typeof r.valeur !== 'number') return { ok: false, message: 'Nombre attendu', position: 0 };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Formule invalide',
      position: null,
    };
  }
}

export interface ResultatCalcul {
  formula: string;
  total: number;
  groups: GroupeDes[];
  critical: Critique;
}

function groupes(jets: JetDes[]): GroupeDes[] {
  return jets.map((j) => ({
    faces: j.faces,
    total: j.total,
    dice: j.des.map((d) => ({ value: d.valeur, kept: d.garde, exploded: d.explosion })),
  }));
}

/** Réussite ou échec critique : un seul d20 retenu, sur 20 ou sur 1. */
function critique(g: GroupeDes[]): Critique {
  const d20 = g.filter((x) => x.faces === 20).flatMap((x) => x.dice.filter((d) => d.kept));
  if (d20.length !== 1) return null;
  return d20[0]!.value === 20 ? 'success' : d20[0]!.value === 1 ? 'failure' : null;
}

/** Lance une formule ; `valeurs` impose les dés (lancer physique), dans l'ordre de la formule. */
export function calculerJet(
  texte: string,
  options: { fiche?: Fiche | null; valeurs?: number[] } = {},
): ResultatCalcul {
  const formula = normaliserFormule(texte);
  const a = analyser(formula);
  if (!a.ok) throw new Error(a.erreur.message);
  const alea = options.valeurs ? aleatoireImpose(options.valeurs) : aleatoireCrypto();
  const r = evaluer(a.noeud, contexte(options.fiche, alea));
  if (typeof r.valeur !== 'number') throw new Error('Le jet doit donner un nombre');
  const g = groupes(r.jets);
  return { formula, total: r.valeur, groups: g, critical: critique(g) };
}

/** Nombre de dés de chaque sorte d'une formule (pour l'animation), sans la lancer. */
export function desDeFormule(texte: string): number[] {
  try {
    return calculerJet(texte).groups.flatMap((g) => g.dice.map(() => g.faces));
  } catch {
    return [];
  }
}

// ─── Historique ──────────────────────────────────────────────────────────────

const COLLECTION = 'jets';
const HISTORIQUE_MAX = 300;

export interface DemandeJet {
  formula: string;
  label?: string | null;
  visibility?: VisibiliteJet;
  roomId?: string | null;
  characterId?: string | null;
  characterName?: string | null;
  fiche?: Fiche | null;
  /** Résultat déjà calculé (animation jouée avant l'enregistrement). */
  resultat?: ResultatCalcul;
}

const local = {
  lister(roomId: string | null): Jet[] {
    const moi = utilisateurLocal().id;
    return lireCollection<Jet>(COLLECTION)
      .filter((j) =>
        roomId
          ? j.roomId === roomId && (j.visibility === 'public' || j.userId === moi)
          : j.userId === moi,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  enregistrer(d: DemandeJet): Jet {
    const moi = utilisateurLocal();
    const r = d.resultat ?? calculerJet(d.formula, { fiche: d.fiche });
    const jet: Jet = {
      id: nouvelId(),
      formula: r.formula,
      label: d.label ?? null,
      total: r.total,
      groups: r.groups,
      critical: r.critical,
      visibility: d.visibility ?? 'public',
      roomId: d.roomId ?? null,
      characterId: d.characterId ?? null,
      characterName: d.characterName ?? null,
      userId: moi.id,
      userName: moi.name,
      userAvatar: moi.avatarUrl,
      createdAt: maintenant(),
    };
    return modifierCollection<Jet, Jet>(COLLECTION, (tous) => ({
      elements: [...tous, jet].slice(-HISTORIQUE_MAX),
      resultat: jet,
    }));
  },

  effacer(): void {
    const moi = utilisateurLocal().id;
    modifierCollection<Jet, void>(COLLECTION, (tous) => ({
      elements: tous.filter((j) => j.userId !== moi),
      resultat: undefined,
    }));
  },
};

// Les jets de partie iront au service character (jet d'autorité côté serveur)
const distant = () => serviceActif('character');

export const jets = {
  lister: (roomId: string | null) =>
    distant()
      ? api<Jet[]>(`/v1/characters/rolls?${new URLSearchParams(roomId ? { room: roomId } : {})}`)
      : local.lister(roomId),
  enregistrer: (d: DemandeJet) => {
    if (!distant()) return local.enregistrer(d);
    const { fiche: _fiche, resultat, ...corps } = d;
    return api<Jet>('/v1/characters/rolls', {
      method: 'POST',
      body: JSON.stringify({ ...corps, values: resultat?.groups.flatMap((g) => g.dice) }),
    });
  },
  effacer: () =>
    distant() ? api<void>('/v1/characters/rolls', { method: 'DELETE' }) : local.effacer(),
};

export const clesJets = {
  tous: ['jets'] as const,
  liste: (roomId: string | null) => ['jets', roomId ?? 'perso'] as const,
};

export function useJets(roomId: string | null = null) {
  return useQuery({
    queryKey: clesJets.liste(roomId),
    queryFn: async () => jets.lister(roomId),
  });
}

export function useLancer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (d: DemandeJet) => jets.enregistrer(d),
    onSuccess: () => void client.invalidateQueries({ queryKey: clesJets.tous }),
  });
}

export function useEffacerJets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => jets.effacer(),
    onSuccess: () => void client.invalidateQueries({ queryKey: clesJets.tous }),
  });
}

// ─── Statistiques ────────────────────────────────────────────────────────────

export interface StatsJets {
  nombre: number;
  critiques: number;
  echecsCritiques: number;
  /** Moyenne des d20 retenus, et répartition 1..20. */
  moyenneD20: number | null;
  repartitionD20: number[];
}

export function statistiques(liste: Jet[]): StatsJets {
  const d20 = liste.flatMap((j) =>
    j.groups.filter((g) => g.faces === 20).flatMap((g) => g.dice.filter((d) => d.kept)),
  );
  const repartitionD20 = Array.from({ length: 20 }, () => 0);
  for (const d of d20) repartitionD20[d.value - 1]!++;
  return {
    nombre: liste.length,
    critiques: liste.filter((j) => j.critical === 'success').length,
    echecsCritiques: liste.filter((j) => j.critical === 'failure').length,
    moyenneD20: d20.length ? d20.reduce((s, d) => s + d.value, 0) / d20.length : null,
    repartitionD20,
  };
}
