/**
 * Jets de dés : service dice derrière la gateway (`/v1/dice/*`, contrat dans
 * docs/api-dice.md). Lancer, historique (d'une campagne, ou personnel),
 * statistiques et vidage passent tous par le service ; les réponses passent
 * par un adaptateur explicite vers les types de l'UI. Rien n'est gardé dans
 * le navigateur.
 *
 * L'animation 3D fait foi, comme dans l'ancienne app : les dés roulent
 * (`roll3D`, lib/dice-throw.ts), la face du dessus de chacun est lue à
 * l'arrêt, puis le service calcule et enregistre le jet avec ces faces
 * (`physicalResults`). Repli : sans animation (préférence coupée, jet caché,
 * plus de 15 dés, dés sans forme 3D comme le d100, délai dépassé), le service
 * tire lui-même les dés manquants. Le résultat n'est connu qu'une fois les
 * dés arrêtés.
 *
 * La formule est vérifiée ici, en direct, par le moteur de règles
 * (`@vtt/rules`, fiche du personnage comprise) ; elle n'y est jamais calculée
 * pour de vrai.
 *
 * Temps réel : `useSynchroJets` applique `dice.rolled`, `dice.roll_deleted`
 * et `dice.history_cleared` au cache (le jet arrivé est relu en REST, qui
 * applique le masquage des jets cachés).
 */
'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  analyser,
  evaluer,
  aleatoireCrypto,
  normaliserFormuleJet,
  type ErreurFormule,
  type ContexteEvaluation,
  type Fiche,
  type Generateur,
} from '@vtt/rules';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { api } from './api';
import { roll3D, setDiceSound, type ThrowRequest } from './dice-throw';
import {
  DEFAULT_DICE_PREFERENCES,
  dicePreferencesKey,
  dicePreferencesQuery,
  type DicePreferences,
} from './dice-preferences';
import { useCampaignEvents, type RealtimeEvent } from './realtime';
import { useProfil } from './session';
import { randomId } from '@/lib/random-id';

// ─── Contrat de l'API (schémas Zod de backend/dice/src/modules/schemas.ts) ─────

/** `public` : la table ; `private` : l'auteur et le MJ ; `gm` : caché (le MJ seul) ; `self` : l'auteur seul. */
type VisibilityApi = 'public' | 'private' | 'gm' | 'self';
type SourceApi = '3d' | 'mixed' | 'free' | 'action' | 'api' | 'import';

interface RollApi {
  id: string;
  campaignId: string | null;
  uid: string | null;
  userName: string;
  userAvatar: string | null;
  persoId: string | null;
  total: number | null;
  notation: string | null;
  output: string;
  symbolResult: string | null;
  source: SourceApi;
  visibility: VisibilityApi;
  /** Jet caché au MJ vu par son auteur : dés et résultat vides. */
  hidden: boolean;
  label: string | null;
  dice: {
    faces: number;
    values: { value: number; kept: boolean; exploded: boolean }[];
  }[];
  outcome: {
    success: boolean | null;
    critical: boolean;
    fumble: boolean;
  } | null;
  createdAt: string;
}

interface PhysicalResultApi {
  type: string;
  value: number;
}

interface RollRequestApi {
  notation: string;
  campaignId?: string;
  characterId?: string;
  visibility?: VisibilityApi;
  label?: string;
  physicalResults?: PhysicalResultApi[];
}

interface StatsApi {
  rollCount: number;
  outcomes: { critical: number; fumble: number };
  byFaces: {
    faces: number;
    count: number;
    sum: number;
    distribution: { value: number; count: number }[];
  }[];
}

// ─── Types de l'UI ───────────────────────────────────────────────────────────

export type VisibiliteJet = VisibilityApi;
export type Critique = 'success' | 'failure' | null;
export type SourceJet = SourceApi;

export interface GroupeDes {
  faces: number;
  dice: { value: number; kept: boolean; exploded: boolean }[];
  total: number;
}

export interface Jet {
  id: string;
  formula: string;
  label: string | null;
  /** `null` : résultat caché (jet caché au MJ, vu par son auteur). */
  total: number | null;
  groups: GroupeDes[];
  critical: Critique;
  visibility: VisibiliteJet;
  /** Jet caché dont on ne voit pas le résultat. */
  hidden: boolean;
  /** Résultat d'un jet à symboles (« 2 Succès »), à montrer à la place du total. */
  symbolResult: string | null;
  /** Détail lisible du service (`1d20+3 = [17]+3 = 20`). */
  output: string;
  /** `3d` / `mixed` : faces lues sur les dés 3D ; `free` : tiré par le serveur… */
  source: SourceJet;
  roomId: string | null;
  characterId: string | null;
  /** Personnage du jet (son nom est le nom affiché du jet). */
  characterName: string | null;
  userId: string | null;
  /** Nom affiché au moment du jet : personnage, « MJ » ou nom du profil. */
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

function versJet(r: RollApi): Jet {
  return {
    id: r.id,
    formula: r.notation ?? r.label ?? '',
    label: r.label,
    total: r.hidden ? null : r.total,
    groups: r.dice.map((g) => ({
      faces: g.faces,
      dice: g.values,
      total: g.values.reduce((s, d) => s + (d.kept ? d.value : 0), 0),
    })),
    critical: r.outcome?.critical ? 'success' : r.outcome?.fumble ? 'failure' : null,
    visibility: r.visibility,
    hidden: r.hidden,
    symbolResult: r.symbolResult,
    output: r.output,
    source: r.source,
    roomId: r.campaignId,
    characterId: r.persoId,
    characterName: r.persoId ? r.userName : null,
    userId: r.uid,
    userName: r.userName,
    userAvatar: r.userAvatar,
    createdAt: r.createdAt,
  };
}

// ─── Formules ────────────────────────────────────────────────────────────────

/** Écritures courantes acceptées : `D20`, `d%`, `kh` (garder le meilleur). */
export function normaliserFormule(texte: string): string {
  return texte
    .trim()
    .replace(/D(?=\d|%)/g, 'd')
    .replaceAll('d%', 'd100')
    .replace(/kh(\d)/g, 'k$1');
}

/**
 * Formule telle que le moteur la lit : écritures courantes normalisées, puis
 * clés nues du personnage réécrites comme le fait le service de dés
 * (`1d20+CON` → `1d20+mod(@CON)`, `2d6+INIT` → `2d6+@INIT`). Sans fiche, les
 * clés nues restent (la vérification demande alors un personnage).
 */
export function formuleMoteur(
  texte: string,
  fiche?: Fiche | null,
): { ok: true; formule: string } | { ok: false; erreur: ErreurFormule } {
  const f = normaliserFormule(texte);
  if (!fiche) return { ok: true, formule: f };
  return normaliserFormuleJet(fiche.systeme, fiche.entite.type.id, f);
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
      throw new Error(`« ${nom} » : choisissez un personnage pour utiliser ses attributs`);
    },
    aleatoire,
  } satisfies ContexteEvaluation;
}

export type Verification = { ok: true } | { ok: false; message: string; position: number | null };

/** Vérifie une formule sans la lancer pour de vrai (le résultat est jeté). */
export function verifierFormule(texte: string, fiche?: Fiche | null): Verification {
  if (!normaliserFormule(texte)) return { ok: false, message: 'Formule vide', position: null };
  const m = formuleMoteur(texte, fiche);
  if (!m.ok) return { ok: false, message: m.erreur.message, position: m.erreur.position };
  const a = analyser(m.formule);
  if (!a.ok)
    return {
      ok: false,
      message: a.erreur.message,
      position: a.erreur.position,
    };
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

/** Chaque dé fait 1 : jamais d'explosion, on compte les dés que la formule demande. */
const UN: Generateur = { entier: () => 1 };

/**
 * Dés à lancer pour une formule (forme et nombre, dans l'ordre de la formule),
 * sans la calculer : les explosions et les dés sans forme 3D sont laissés au
 * serveur. Formule illisible : aucun dé (le serveur tranchera).
 */
export function desDeFormule(texte: string, fiche?: Fiche | null): ThrowRequest[] {
  try {
    const m = formuleMoteur(texte, fiche);
    if (!m.ok) return [];
    const a = analyser(m.formule);
    if (!a.ok) return [];
    return evaluer(a.noeud, contexte(fiche, UN))
      .jets.filter((j) => j.des.length > 0)
      .map((j) => ({ type: `d${j.faces}`, count: j.des.length }));
  } catch {
    return [];
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

const PAGE = 50;

const nouvelleCle = () => randomId();

function requete(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const texte = q.toString();
  return texte ? `?${texte}` : '';
}

export const jets = {
  /** Historique, du plus récent au plus ancien ; `avant` : page suivante (plus ancienne). */
  lister: async (roomId: string | null, avant?: string) =>
    (
      await api<RollApi[]>(
        `/v1/dice/rolls${requete({ campaignId: roomId, before: avant, limit: String(PAGE) })}`,
      )
    ).map(versJet),

  un: async (id: string) => versJet(await api<RollApi>(`/v1/dice/rolls/${encodeURIComponent(id)}`)),

  /**
   * Le serveur calcule le jet avec les faces lues (`physicalResults`), sinon
   * le tire, et l'enregistre. La clé d'idempotence rend l'envoi rejouable
   * sans relancer les dés.
   */
  lancer: async (corps: RollRequestApi, cle: string) =>
    versJet(
      await api<RollApi>('/v1/dice/rolls', {
        method: 'POST',
        headers: { 'Idempotency-Key': cle },
        body: JSON.stringify(corps),
      }),
    ),

  /** Campagne : tout son historique (MJ seul). Sans campagne : mes jets personnels. */
  effacer: (roomId: string | null) =>
    api<{ deleted: number }>(`/v1/dice/rolls${requete({ campaignId: roomId })}`, {
      method: 'DELETE',
    }),

  /** Sans campagne : tous mes jets, campagnes comprises (hors jets cachés). */
  statistiques: (roomId: string | null) =>
    api<StatsApi>(`/v1/dice/stats${requete({ campaignId: roomId })}`),
};

export const clesJets = {
  tous: ['jets'] as const,
  liste: (roomId: string | null) => ['jets', 'liste', roomId ?? 'perso'] as const,
  stats: (roomId: string | null) => ['jets', 'stats', roomId ?? 'perso'] as const,
};

type PagesJets = InfiniteData<Jet[], string | undefined>;

/** Historique d'un contexte (campagne, ou jets personnels), page par page. */
export function useJets(roomId: string | null = null) {
  return useInfiniteQuery({
    queryKey: clesJets.liste(roomId),
    queryFn: ({ pageParam }) => jets.lister(roomId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (derniere) => (derniere.length >= PAGE ? derniere.at(-1)?.id : undefined),
    select: (d) => d.pages.flat(),
  });
}

/** Ajoute (ou remplace) un jet en tête de l'historique en cache, sans doublon. */
function insererJet(client: QueryClient, jet: Jet) {
  client.setQueryData<PagesJets>(clesJets.liste(jet.roomId), (d) => {
    if (!d?.pages.length) return d;
    const connu = d.pages.some((p) => p.some((j) => j.id === jet.id));
    const pages = d.pages.map((p) => p.map((j) => (j.id === jet.id ? jet : j)));
    if (!connu) pages[0] = [jet, ...pages[0]!].sort((a, b) => (a.id < b.id ? 1 : -1));
    return { ...d, pages };
  });
}

function retirerJet(client: QueryClient, roomId: string | null, id: string) {
  client.setQueryData<PagesJets>(clesJets.liste(roomId), (d) =>
    d ? { ...d, pages: d.pages.map((p) => p.filter((j) => j.id !== id)) } : d,
  );
}

const jetConnu = (client: QueryClient, roomId: string | null, id: string) =>
  client
    .getQueryData<PagesJets>(clesJets.liste(roomId))
    ?.pages.some((p) => p.some((j) => j.id === id)) ?? false;

export interface DemandeJet {
  formula: string;
  label?: string | null;
  /** Dans une campagne seulement ; hors campagne, le jet est personnel. */
  visibility?: VisibiliteJet;
  roomId?: string | null;
  characterId?: string | null;
  /** Fiche calculée du personnage : dés d'une formule qui dépend de ses valeurs. */
  fiche?: Fiche | null;
}

/**
 * Lance un jet : les dés 3D roulent (si l'animation est active), leurs faces
 * lues à l'arrêt partent au service, qui calcule et enregistre le jet. Le
 * résultat n'arrive qu'ensuite.
 */
export function useLancer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (d: DemandeJet): Promise<Jet> => {
      const cle = nouvelleCle();
      const formula = normaliserFormule(d.formula);
      const roomId = d.roomId ?? null;
      const visibility = roomId ? (d.visibility ?? 'public') : 'self';
      const prefs: DicePreferences = await client
        .ensureQueryData(dicePreferencesQuery)
        // Préférences illisibles : pas de 3D, le serveur tire (le canevas est coûteux)
        .catch(() => ({ ...DEFAULT_DICE_PREFERENCES, animation3d: false }));
      // Lancer depuis un écran sans réglages de dés (palette) : le son suit quand même la préférence
      setDiceSound(prefs.sound);
      const faces = await roll3D(desDeFormule(formula, d.fiche), {
        enabled: prefs.animation3d,
        blind: visibility === 'gm',
        skinId: prefs.skinId,
      });
      return jets.lancer(
        {
          notation: formula,
          ...(roomId ? { campaignId: roomId, visibility } : {}),
          ...(d.characterId ? { characterId: d.characterId } : {}),
          ...(d.label?.trim() ? { label: d.label.trim().slice(0, 200) } : {}),
          ...(faces
            ? {
                physicalResults: faces.map(({ type, value }) => ({
                  type,
                  value,
                })),
              }
            : {}),
        },
        cle,
      );
    },
    onSuccess: (jet) => {
      insererJet(client, jet);
      void client.invalidateQueries({ queryKey: clesJets.stats(jet.roomId) });
    },
  });
}

/** Vide l'historique du contexte : la campagne (MJ), ou mes jets personnels. */
export function useEffacerJets(roomId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => jets.effacer(roomId),
    onSuccess: () => {
      void client.resetQueries({ queryKey: clesJets.liste(roomId) });
      void client.invalidateQueries({ queryKey: clesJets.stats(roomId) });
    },
  });
}

/** Jets d'action enregistrés ailleurs (fiche) : relus au prochain affichage. */
export function marquerJetsPerimes(client: QueryClient) {
  void client.invalidateQueries({
    queryKey: clesJets.tous,
    refetchType: 'none',
  });
}

// ─── Statistiques ────────────────────────────────────────────────────────────

export interface StatsJets {
  nombre: number;
  critiques: number;
  echecsCritiques: number;
  /** d20 lancés (dés écartés compris), leur moyenne et leur répartition 1..20. */
  nbD20: number;
  moyenneD20: number | null;
  repartitionD20: number[];
}

function versStats(s: StatsApi): StatsJets {
  const d20 = s.byFaces.find((f) => f.faces === 20);
  const repartitionD20 = Array.from({ length: 20 }, () => 0);
  for (const { value, count } of d20?.distribution ?? [])
    if (value >= 1 && value <= 20) repartitionD20[value - 1] = count;
  return {
    nombre: s.rollCount,
    critiques: s.outcomes.critical,
    echecsCritiques: s.outcomes.fumble,
    nbD20: d20?.count ?? 0,
    moyenneD20: d20?.count ? d20.sum / d20.count : null,
    repartitionD20,
  };
}

/**
 * Statistiques calculées par le service sur tout l'historique visible : la
 * campagne (jets dont je vois le résultat), ou sans campagne tous mes jets.
 */
export function useStatsJets(roomId: string | null, actif = true) {
  return useQuery({
    queryKey: clesJets.stats(roomId),
    queryFn: async () => versStats(await jets.statistiques(roomId)),
    enabled: actif,
  });
}

// ─── Temps réel ──────────────────────────────────────────────────────────────

const EVENEMENTS = [
  'dice.rolled',
  'dice.roll_deleted',
  'dice.history_cleared',
  'dice.preferences_updated',
] as const;

/** Applique un événement du service dice au cache de l'historique `roomId`. */
export async function appliquerEvenementDes(
  client: QueryClient,
  roomId: string | null,
  e: RealtimeEvent,
  onNouveau?: (jet: Jet) => void,
): Promise<void> {
  const { type, aggregate } = e.event;
  if (type === 'dice.preferences_updated') {
    void client.invalidateQueries({ queryKey: dicePreferencesKey });
    return;
  }
  if (type === 'dice.history_cleared') {
    void client.resetQueries({ queryKey: clesJets.liste(roomId) });
    void client.invalidateQueries({ queryKey: clesJets.stats(roomId) });
    return;
  }
  if (type === 'dice.roll_deleted') {
    retirerJet(client, roomId, aggregate.id);
    void client.invalidateQueries({ queryKey: clesJets.stats(roomId) });
    return;
  }
  if (type === 'dice.rolled') {
    // Déjà là : c'est mon jet, ajouté par la réponse du lancer
    if (jetConnu(client, roomId, aggregate.id)) return;
    // Relu en REST : le service applique le masquage (jet caché vu par son auteur)
    try {
      const jet = await jets.un(aggregate.id);
      insererJet(client, jet);
      onNouveau?.(jet);
    } catch {
      // Jet déjà supprimé, ou plus visible : rien à montrer
    }
    void client.invalidateQueries({ queryKey: clesJets.stats(roomId) });
  }
}

/**
 * Tient à jour en direct l'historique et les statistiques d'un contexte : la
 * campagne, ou mes jets personnels (`null`, événements personnels). Les jets
 * des autres joueurs arrivés en direct sont annoncés discrètement.
 */
export function useSynchroJets(roomId: string | null): { live: boolean } {
  const client = useQueryClient();
  const moi = useProfil().id;
  const { live, generation } = useCampaignEvents(roomId, EVENEMENTS, (e) => {
    void appliquerEvenementDes(client, roomId, e, (jet) => {
      if (!roomId || jet.userId === moi) return;
      const resultat = jet.hidden ? '?' : (jet.symbolResult ?? String(jet.total ?? '?'));
      toast(`${jet.userName} : ${resultat}`, {
        description: jet.label ? `${jet.label} · ${jet.formula}` : jet.formula,
        duration: 5000,
      });
    });
  });

  // (Ré)abonnement sans rejeu possible : l'historique est relu
  useEffect(() => {
    if (generation === 0) return;
    void client.invalidateQueries({ queryKey: clesJets.liste(roomId) });
    void client.invalidateQueries({ queryKey: clesJets.stats(roomId) });
  }, [client, roomId, generation]);

  return { live };
}
