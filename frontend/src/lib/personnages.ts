/**
 * Personnages : service character, `/v1/characters`. Un personnage appartient
 * à un joueur et porte l'état saisi (`EtatEntite` de @vtt/rules) : toutes les
 * valeurs dérivées sont recalculées par le moteur, dans le front pour
 * l'aperçu, dans le service pour faire autorité.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EtatEntite } from '@vtt/rules';
import { api } from './api';
import {
  erreurLocale,
  lireCollection,
  maintenant,
  modifierCollection,
  nouvelId,
  serviceActif,
  utilisateurLocal,
} from './depot-local';

/**
 * Résumé dénormalisé, recalculé à chaque enregistrement : les listes
 * l'affichent sans charger le système ni recalculer la fiche.
 */
export interface ResumePersonnage {
  /** « Elfe · Magicien » : entrées uniques (race, profil, carrière…). */
  tagline: string;
  /** Valeurs clés (« Niveau 3 », « PV 12/14 ») pour les cartes. */
  highlights: { label: string; value: string }[];
}

export interface DetailsPersonnage {
  concept: string;
  appearance: string;
  backstory: string;
}

export interface Personnage {
  id: string;
  name: string;
  portraitUrl: string | null;
  system: { id: string; version: string };
  state: EtatEntite;
  /** Campagne où le personnage est engagé. */
  roomId: string | null;
  ownerId: string;
  ownerName: string;
  summary: ResumePersonnage;
  details: DetailsPersonnage;
  createdAt: string;
  updatedAt: string;
}

export type NouveauPersonnage = Pick<
  Personnage,
  'name' | 'portraitUrl' | 'system' | 'state' | 'roomId' | 'summary' | 'details'
>;

export type ModificationPersonnage = Partial<
  Pick<Personnage, 'name' | 'portraitUrl' | 'state' | 'roomId' | 'summary' | 'details'>
>;

// ─── Dépôt local ─────────────────────────────────────────────────────────────

const COLLECTION = 'personnages';

function aMoi(p: Personnage | undefined, moi: string): Personnage {
  if (!p || p.ownerId !== moi) throw erreurLocale('Personnage introuvable', 404);
  return p;
}

const local = {
  lister(): Personnage[] {
    const moi = utilisateurLocal().id;
    return lireCollection<Personnage>(COLLECTION)
      .filter((p) => p.ownerId === moi)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  /** Personnages engagés dans une campagne (tous joueurs confondus). */
  listerCampagne(roomId: string): Personnage[] {
    return lireCollection<Personnage>(COLLECTION)
      .filter((p) => p.roomId === roomId)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  },

  lire(id: string): Personnage {
    const p = lireCollection<Personnage>(COLLECTION).find((x) => x.id === id);
    if (!p) throw erreurLocale('Personnage introuvable', 404);
    return p;
  },

  creer(n: NouveauPersonnage): Personnage {
    const moi = utilisateurLocal();
    const date = maintenant();
    const p: Personnage = {
      ...n,
      id: nouvelId(),
      ownerId: moi.id,
      ownerName: moi.name,
      createdAt: date,
      updatedAt: date,
    };
    return modifierCollection<Personnage, Personnage>(COLLECTION, (tous) => ({
      elements: [...tous, p],
      resultat: p,
    }));
  },

  modifier(id: string, modif: ModificationPersonnage): Personnage {
    const moi = utilisateurLocal().id;
    return modifierCollection<Personnage, Personnage>(COLLECTION, (tous) => {
      const i = tous.findIndex((p) => p.id === id);
      const suivant = { ...aMoi(tous[i], moi), ...modif, updatedAt: maintenant() };
      const elements = [...tous];
      elements[i] = suivant;
      return { elements, resultat: suivant };
    });
  },

  supprimer(id: string): void {
    const moi = utilisateurLocal().id;
    modifierCollection<Personnage, void>(COLLECTION, (tous) => {
      aMoi(
        tous.find((p) => p.id === id),
        moi,
      );
      return { elements: tous.filter((p) => p.id !== id), resultat: undefined };
    });
  },
};

// ─── Accès (API ou dépôt local) ──────────────────────────────────────────────

const distant = () => serviceActif('character');
const url = (id: string) => `/v1/characters/${encodeURIComponent(id)}`;

export const personnages = {
  lister: () => (distant() ? api<Personnage[]>('/v1/characters?owner=me') : local.lister()),
  listerCampagne: (roomId: string) =>
    distant()
      ? api<Personnage[]>(`/v1/characters?${new URLSearchParams({ room: roomId })}`)
      : local.listerCampagne(roomId),
  lire: (id: string) => (distant() ? api<Personnage>(url(id)) : local.lire(id)),
  creer: (n: NouveauPersonnage) =>
    distant()
      ? api<Personnage>('/v1/characters', { method: 'POST', body: JSON.stringify(n) })
      : local.creer(n),
  modifier: (id: string, m: ModificationPersonnage) =>
    distant()
      ? api<Personnage>(url(id), { method: 'PATCH', body: JSON.stringify(m) })
      : local.modifier(id, m),
  supprimer: (id: string) =>
    distant() ? api<void>(url(id), { method: 'DELETE' }) : local.supprimer(id),
};

// ─── Hooks de domaine ────────────────────────────────────────────────────────

export const clesPersonnages = {
  miens: ['personnages', 'miens'] as const,
  campagne: (roomId: string) => ['personnages', 'campagne', roomId] as const,
  un: (id: string) => ['personnages', 'un', id] as const,
};

export function usePersonnages() {
  return useQuery({ queryKey: clesPersonnages.miens, queryFn: async () => personnages.lister() });
}

export function usePersonnagesCampagne(roomId: string | null | undefined) {
  return useQuery({
    queryKey: clesPersonnages.campagne(roomId ?? ''),
    queryFn: async () => personnages.listerCampagne(roomId!),
    enabled: Boolean(roomId),
  });
}

export function usePersonnage(id: string | null | undefined) {
  return useQuery({
    queryKey: clesPersonnages.un(id ?? ''),
    queryFn: async () => personnages.lire(id!),
    enabled: Boolean(id),
  });
}

function useMutationPersonnage<A>(action: (args: A) => Personnage | Promise<Personnage>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: A) => action(args),
    onSuccess: (p) => {
      client.setQueryData(clesPersonnages.un(p.id), p);
      void client.invalidateQueries({ queryKey: ['personnages'] });
    },
  });
}

export const useCreerPersonnage = () => useMutationPersonnage(personnages.creer);
export const useModifierPersonnage = (id: string) =>
  useMutationPersonnage((m: ModificationPersonnage) => personnages.modifier(id, m));

export function useSupprimerPersonnage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => personnages.supprimer(id),
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: clesPersonnages.un(id) });
      void client.invalidateQueries({ queryKey: ['personnages'] });
    },
  });
}
