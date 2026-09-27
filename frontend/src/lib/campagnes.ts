/**
 * Campagnes (salles) : service campaign, `/v1/rooms`. Tant qu'il n'est pas
 * déployé, le dépôt local du navigateur sert les mêmes fonctions.
 *
 * Les champs suivent la convention des API existantes (JSON en anglais) : ce
 * fichier fixe le contrat que le service implémentera.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export type RoleCampagne = 'gm' | 'player';
export type Visibilite = 'public' | 'private';
/** Couleur d'accent de la campagne (voir globals.css, [data-ambiance]). */
export type Ambiance = 'or' | 'braise' | 'arcane' | 'sylve' | 'givre' | 'sang';

export interface Membre {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: RoleCampagne;
  /** Personnage joué dans cette campagne (null : pas encore choisi, ou MJ). */
  characterId: string | null;
  joinedAt: string;
}

export interface Invitation {
  userId: string;
  name: string;
  avatarUrl: string | null;
  invitedAt: string;
}

export interface SessionPrevue {
  id: string;
  startsAt: string;
  title: string | null;
}

export interface Campagne {
  id: string;
  name: string;
  /** Accroche d'une ligne, affichée sur les cartes. */
  pitch: string;
  description: string;
  coverUrl: string | null;
  /** Identifiant du système de jeu (définitif). */
  system: string;
  ambiance: Ambiance;
  visibility: Visibilite;
  maxPlayers: number;
  /** Les joueurs peuvent créer leur personnage eux-mêmes. */
  freeCreation: boolean;
  tags: string[];
  /** Code à 6 caractères pour rejoindre. */
  code: string;
  ownerId: string;
  members: Membre[];
  invitations: Invitation[];
  sessions: SessionPrevue[];
  createdAt: string;
  updatedAt: string;
}

export type NouvelleCampagne = Pick<
  Campagne,
  | 'name'
  | 'pitch'
  | 'description'
  | 'coverUrl'
  | 'system'
  | 'ambiance'
  | 'visibility'
  | 'maxPlayers'
  | 'freeCreation'
  | 'tags'
> & { invite: { userId: string; name: string; avatarUrl: string | null }[] };

export type ModificationCampagne = Partial<
  Pick<
    Campagne,
    | 'name'
    | 'pitch'
    | 'description'
    | 'coverUrl'
    | 'ambiance'
    | 'visibility'
    | 'maxPlayers'
    | 'freeCreation'
    | 'tags'
  >
>;

export const JOUEURS_MAX = 12;
export const LONGUEUR_CODE = 6;

/** Rôle de l'utilisateur dans la campagne, ou null s'il n'en est pas membre. */
export function monRole(c: Campagne, userId: string): RoleCampagne | null {
  return c.members.find((m) => m.userId === userId)?.role ?? null;
}

export function nombreJoueurs(c: Campagne) {
  return c.members.filter((m) => m.role === 'player').length;
}

export function prochaineSession(c: Campagne): SessionPrevue | null {
  const now = Date.now();
  return (
    [...c.sessions]
      .filter((s) => new Date(s.startsAt).getTime() > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null
  );
}

// ─── Dépôt local ─────────────────────────────────────────────────────────────

const COLLECTION = 'campagnes';
// Sans I, O, 0, 1 : un code se dicte sans ambiguïté
const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function nouveauCode(existants: Set<string>): string {
  for (;;) {
    const octets = crypto.getRandomValues(new Uint8Array(LONGUEUR_CODE));
    const code = Array.from(octets, (o) => ALPHABET_CODE[o % ALPHABET_CODE.length]).join('');
    if (!existants.has(code)) return code;
  }
}

function membreOuErreur(c: Campagne | undefined, userId: string): Campagne {
  if (!c || !c.members.some((m) => m.userId === userId))
    throw erreurLocale('Campagne introuvable', 404);
  return c;
}

function exigerMj(c: Campagne, userId: string) {
  if (monRole(c, userId) !== 'gm')
    throw erreurLocale('Réservé au maître du jeu de la campagne', 403);
}

function majCampagne(id: string, maj: (c: Campagne, moi: string) => Campagne): Campagne {
  const moi = utilisateurLocal().id;
  return modifierCollection<Campagne, Campagne>(COLLECTION, (toutes) => {
    const i = toutes.findIndex((c) => c.id === id);
    const suivante = { ...maj(membreOuErreur(toutes[i], moi), moi), updatedAt: maintenant() };
    const elements = [...toutes];
    elements[i] = suivante;
    return { elements, resultat: suivante };
  });
}

const local = {
  lister(): Campagne[] {
    const moi = utilisateurLocal().id;
    return lireCollection<Campagne>(COLLECTION)
      .filter((c) => c.members.some((m) => m.userId === moi))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  lire(id: string): Campagne {
    const moi = utilisateurLocal().id;
    return membreOuErreur(
      lireCollection<Campagne>(COLLECTION).find((c) => c.id === id),
      moi,
    );
  },

  creer(n: NouvelleCampagne): Campagne {
    const moi = utilisateurLocal();
    const date = maintenant();
    return modifierCollection<Campagne, Campagne>(COLLECTION, (toutes) => {
      const { invite, ...champs } = n;
      const campagne: Campagne = {
        ...champs,
        id: nouvelId(),
        code: nouveauCode(new Set(toutes.map((c) => c.code))),
        ownerId: moi.id,
        members: [
          {
            userId: moi.id,
            name: moi.name,
            avatarUrl: moi.avatarUrl,
            role: 'gm',
            characterId: null,
            joinedAt: date,
          },
        ],
        invitations: invite
          .filter((i) => i.userId !== moi.id)
          .map((i) => ({ ...i, invitedAt: date })),
        sessions: [],
        createdAt: date,
        updatedAt: date,
      };
      return { elements: [...toutes, campagne], resultat: campagne };
    });
  },

  modifier(id: string, modif: ModificationCampagne): Campagne {
    return majCampagne(id, (c, moi) => {
      exigerMj(c, moi);
      return { ...c, ...modif };
    });
  },

  supprimer(id: string): void {
    const moi = utilisateurLocal().id;
    modifierCollection<Campagne, void>(COLLECTION, (toutes) => {
      const c = membreOuErreur(
        toutes.find((x) => x.id === id),
        moi,
      );
      if (c.ownerId !== moi) throw erreurLocale('Seul le créateur peut supprimer la campagne', 403);
      return { elements: toutes.filter((x) => x.id !== id), resultat: undefined };
    });
  },

  rejoindre(code: string): Campagne {
    const moi = utilisateurLocal();
    const cherche = code.trim().toUpperCase();
    return modifierCollection<Campagne, Campagne>(COLLECTION, (toutes) => {
      const i = toutes.findIndex((c) => c.code === cherche);
      const c = toutes[i];
      if (!c) throw erreurLocale('Aucune campagne ne correspond à ce code', 404);
      if (c.members.some((m) => m.userId === moi.id)) return { elements: toutes, resultat: c };
      if (nombreJoueurs(c) >= c.maxPlayers) throw erreurLocale('Cette campagne est complète', 409);
      const suivante: Campagne = {
        ...c,
        members: [
          ...c.members,
          {
            userId: moi.id,
            name: moi.name,
            avatarUrl: moi.avatarUrl,
            role: 'player',
            characterId: null,
            joinedAt: maintenant(),
          },
        ],
        invitations: c.invitations.filter((x) => x.userId !== moi.id),
        updatedAt: maintenant(),
      };
      const elements = [...toutes];
      elements[i] = suivante;
      return { elements, resultat: suivante };
    });
  },

  quitter(id: string): void {
    const moi = utilisateurLocal().id;
    modifierCollection<Campagne, void>(COLLECTION, (toutes) => {
      const c = membreOuErreur(
        toutes.find((x) => x.id === id),
        moi,
      );
      if (c.ownerId === moi)
        throw erreurLocale('Le créateur ne peut pas quitter sa campagne : supprimez-la', 409);
      return {
        elements: toutes.map((x) =>
          x.id === id ? { ...x, members: x.members.filter((m) => m.userId !== moi) } : x,
        ),
        resultat: undefined,
      };
    });
  },

  /** Choisit le personnage joué (null : jouer en MJ, réservé au MJ). */
  incarner(id: string, characterId: string | null): Campagne {
    return majCampagne(id, (c, moi) => ({
      ...c,
      members: c.members.map((m) => (m.userId === moi ? { ...m, characterId } : m)),
    }));
  },

  retirerMembre(id: string, userId: string): Campagne {
    return majCampagne(id, (c, moi) => {
      exigerMj(c, moi);
      if (userId === c.ownerId) throw erreurLocale('Le créateur ne peut pas être retiré', 409);
      return { ...c, members: c.members.filter((m) => m.userId !== userId) };
    });
  },

  nouveauCode(id: string): Campagne {
    const codes = new Set(lireCollection<Campagne>(COLLECTION).map((c) => c.code));
    return majCampagne(id, (c, moi) => {
      exigerMj(c, moi);
      return { ...c, code: nouveauCode(codes) };
    });
  },

  planifier(id: string, startsAt: string, title: string | null): Campagne {
    return majCampagne(id, (c, moi) => {
      exigerMj(c, moi);
      return { ...c, sessions: [...c.sessions, { id: nouvelId(), startsAt, title }] };
    });
  },

  deplanifier(id: string, sessionId: string): Campagne {
    return majCampagne(id, (c, moi) => {
      exigerMj(c, moi);
      return { ...c, sessions: c.sessions.filter((s) => s.id !== sessionId) };
    });
  },
};

// ─── Accès (API ou dépôt local) ──────────────────────────────────────────────

const distant = () => serviceActif('campaign');
const json = (corps: unknown) => ({ body: JSON.stringify(corps) });

export const campagnes = {
  lister: () => (distant() ? api<Campagne[]>('/v1/rooms?member=me') : local.lister()),
  lire: (id: string) =>
    distant() ? api<Campagne>(`/v1/rooms/${encodeURIComponent(id)}`) : local.lire(id),
  creer: (n: NouvelleCampagne) =>
    distant() ? api<Campagne>('/v1/rooms', { method: 'POST', ...json(n) }) : local.creer(n),
  modifier: (id: string, m: ModificationCampagne) =>
    distant()
      ? api<Campagne>(`/v1/rooms/${encodeURIComponent(id)}`, { method: 'PATCH', ...json(m) })
      : local.modifier(id, m),
  supprimer: (id: string) =>
    distant()
      ? api<void>(`/v1/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' })
      : local.supprimer(id),
  rejoindre: (code: string) =>
    distant()
      ? api<Campagne>('/v1/rooms/join', { method: 'POST', ...json({ code }) })
      : local.rejoindre(code),
  quitter: (id: string) =>
    distant()
      ? api<void>(`/v1/rooms/${encodeURIComponent(id)}/members/me`, { method: 'DELETE' })
      : local.quitter(id),
  incarner: (id: string, characterId: string | null) =>
    distant()
      ? api<Campagne>(`/v1/rooms/${encodeURIComponent(id)}/members/me`, {
          method: 'PATCH',
          ...json({ characterId }),
        })
      : local.incarner(id, characterId),
  retirerMembre: (id: string, userId: string) =>
    distant()
      ? api<Campagne>(`/v1/rooms/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        })
      : local.retirerMembre(id, userId),
  nouveauCode: (id: string) =>
    distant()
      ? api<Campagne>(`/v1/rooms/${encodeURIComponent(id)}/code`, { method: 'POST' })
      : local.nouveauCode(id),
  planifier: (id: string, startsAt: string, title: string | null) =>
    distant()
      ? api<Campagne>(`/v1/rooms/${encodeURIComponent(id)}/sessions`, {
          method: 'POST',
          ...json({ startsAt, title }),
        })
      : local.planifier(id, startsAt, title),
  deplanifier: (id: string, sessionId: string) =>
    distant()
      ? api<Campagne>(
          `/v1/rooms/${encodeURIComponent(id)}/sessions/${encodeURIComponent(sessionId)}`,
          { method: 'DELETE' },
        )
      : local.deplanifier(id, sessionId),
};

// ─── Hooks de domaine ────────────────────────────────────────────────────────

export const clesCampagnes = {
  toutes: ['campagnes'] as const,
  une: (id: string) => ['campagnes', id] as const,
};

export function useCampagnes() {
  return useQuery({
    queryKey: clesCampagnes.toutes,
    queryFn: async () => campagnes.lister(),
  });
}

export function useCampagne(id: string | null | undefined) {
  return useQuery({
    queryKey: clesCampagnes.une(id ?? ''),
    queryFn: async () => campagnes.lire(id!),
    enabled: Boolean(id),
  });
}

/**
 * Mutation qui renvoie la campagne à jour : le cache de la campagne est
 * remplacé, la liste rechargée.
 */
function useMutationCampagne<A>(action: (args: A) => Campagne | Promise<Campagne>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: A) => action(args),
    onSuccess: (c) => {
      client.setQueryData(clesCampagnes.une(c.id), c);
      void client.invalidateQueries({ queryKey: clesCampagnes.toutes, exact: true });
    },
  });
}

export const useCreerCampagne = () => useMutationCampagne(campagnes.creer);
export const useRejoindreCampagne = () => useMutationCampagne(campagnes.rejoindre);
export const useModifierCampagne = (id: string) =>
  useMutationCampagne((m: ModificationCampagne) => campagnes.modifier(id, m));
export const useIncarner = (id: string) =>
  useMutationCampagne((characterId: string | null) => campagnes.incarner(id, characterId));
export const useRetirerMembre = (id: string) =>
  useMutationCampagne((userId: string) => campagnes.retirerMembre(id, userId));
export const useNouveauCode = (id: string) =>
  useMutationCampagne<void>(() => campagnes.nouveauCode(id));
export const usePlanifier = (id: string) =>
  useMutationCampagne((s: { startsAt: string; title: string | null }) =>
    campagnes.planifier(id, s.startsAt, s.title),
  );
export const useDeplanifier = (id: string) =>
  useMutationCampagne((sessionId: string) => campagnes.deplanifier(id, sessionId));

/** Supprimer ou quitter : la campagne disparaît du cache. */
export function useSortirCampagne(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (mode: 'supprimer' | 'quitter') =>
      mode === 'supprimer' ? campagnes.supprimer(id) : campagnes.quitter(id),
    onSuccess: () => {
      client.removeQueries({ queryKey: clesCampagnes.une(id) });
      void client.invalidateQueries({ queryKey: clesCampagnes.toutes, exact: true });
    },
  });
}
