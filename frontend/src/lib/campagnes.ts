/**
 * Campagnes : service campaign derrière la gateway (`/v1/campaigns/**`,
 * contrat dans docs/api-campaign.md). Toutes les données viennent du service ;
 * les réponses passent par un adaptateur explicite vers les types de l'UI
 * (couleur d'accent, visibilité, rôle, personnage incarné par chaque membre).
 */
'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { MAX_SIDE, prepareImage } from './uploads/image';
import { uploadFile, type UploadProgress } from './uploads/uploader';

// ─── Contrat de l'API (schémas Zod de backend/campaign/src/modules/schemas.ts) ─

type RoleApi = 'gm' | 'player' | 'spectator';
type AccentApi = 'gold' | 'ember' | 'arcane' | 'sylvan' | 'frost' | 'blood';
type CampApi = 'players' | 'enemies' | 'allies';

interface UserRefApi {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

interface MemberApi {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  role: RoleApi;
}

interface SessionApi {
  id: string;
  date: string;
  title: string | null;
}

interface CampaignFieldsApi {
  id: string;
  name: string;
  description: string;
  system: { id: string; version: string };
  code: string;
  imageUrl: string | null;
  isPublic: boolean;
  characterCreation: boolean;
  pitch: string;
  accent: AccentApi;
  tags: string[];
  playerCount: number;
  owner: UserRefApi;
  updatedAt: string;
}

/** DetailCampagne publique ou invitation reçue. */
interface CampaignSummaryApi extends CampaignFieldsApi {
  role: RoleApi | null;
  memberCount: number;
}

/** Une de mes campagnes (GET /v1/campaigns). */
interface MyCampaignSummaryApi extends CampaignSummaryApi {
  role: RoleApi;
  members: MemberApi[];
  nextSession: SessionApi | null;
  playedCharacterId: string | null;
  characterIds: string[];
}

interface InvitedCampaignApi extends CampaignSummaryApi {
  invitedBy: UserRefApi;
  invitedAt: string;
}

interface InviteeApi {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  invitedBy: string;
  invitedAt: string;
}

interface EngagementApi {
  characterId: string;
  ownerId: string;
  side: CampApi;
  addedBy: string;
  playedBy: string | null;
}

/** Détail (GET /v1/campaigns/:id et réponses des routes qui modifient la campagne). */
interface CampaignApi extends CampaignFieldsApi {
  ownerId: string;
  role: RoleApi;
  playedCharacterId: string | null;
  members: MemberApi[];
  characters: EngagementApi[];
  invitees: InviteeApi[];
  version: number;
  createdAt: string;
}

interface PublicPageApi {
  campaigns: CampaignSummaryApi[];
  page: number;
  perPage: number;
  total: number;
}

/** Nature d'un personnage dans character : joueur (`pc`) ou PNJ (`npc`). */
export type CharacterKindApi = 'pc' | 'npc';

/** Personnage engagé (GET /v1/campaigns/:id/characters), lu par le domaine personnages. */
export interface CampaignCharacterApi {
  characterId: string;
  name: string | null;
  avatarUrl: string | null;
  /** Token du Studio du portrait ; null : le portrait sert de token. */
  tokenUrl?: string | null;
  /** Image d'un de ses tokens sur les cartes (PNJ sans portrait) : dernier recours. */
  mapImageUrl?: string | null;
  type: string | null;
  /** Personnage joueur ou PNJ, selon character ; null s'il ne le dit pas. */
  kind: CharacterKindApi | null;
  side: CampApi;
  ownerId: string;
  playedBy: string | null;
  inCreation: boolean;
  summary: { tagline: string; highlights: { label: string; value: string }[] } | null;
}

// ─── Types de l'UI ───────────────────────────────────────────────────────────

export type RoleCampagne = RoleApi;
export type Visibilite = 'public' | 'private';
export type Camp = CampApi;
/** Couleur d'accent de la campagne (voir globals.css, [data-ambiance]). */
export type Ambiance = 'or' | 'braise' | 'arcane' | 'sylve' | 'givre' | 'sang';

export interface Personne {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface Membre {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: RoleCampagne;
  /** Personnage incarné dans cette campagne (null : pas encore choisi, ou MJ). */
  characterId: string | null;
}

/** Invitation nominative en attente (visible du MJ). */
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

/** Personnage engagé dans la campagne, et le membre qui l'incarne. */
export interface Engagement {
  characterId: string;
  ownerId: string;
  side: Camp;
  playedBy: string | null;
}

/** Champs communs aux listes et au détail. */
interface BaseCampagne {
  id: string;
  name: string;
  /** Accroche d'une ligne, affichée sur les cartes. */
  pitch: string;
  description: string;
  coverUrl: string | null;
  /** Identifiant du système de jeu (définitif une fois des personnages engagés). */
  system: string;
  systemVersion: string;
  ambiance: Ambiance;
  visibility: Visibilite;
  /** Les joueurs peuvent créer leur personnage eux-mêmes. */
  freeCreation: boolean;
  tags: string[];
  /** Code à 6 caractères pour rejoindre. */
  code: string;
  owner: Personne;
  /** Membres qui ne sont pas MJ (spectateurs compris). */
  playerCount: number;
  updatedAt: string;
}

/** DetailCampagne dans une liste : mes campagnes, campagnes publiques, invitations reçues. */
export interface Campagne extends BaseCampagne {
  /** Mon rôle ; null si je n'en suis pas membre (campagne publique, invitation). */
  role: RoleCampagne | null;
  memberCount: number;
  /** Premiers membres, MJ d'abord (mes campagnes seulement) ; `memberCount` donne le total. */
  members: Membre[];
  nextSession: SessionPrevue | null;
  /** Personnage que j'incarne. */
  playedCharacterId: string | null;
  /** Tous les personnages engagés. */
  characterIds: string[];
}

export interface InvitationRecue extends Campagne {
  invitedBy: Personne;
  invitedAt: string;
}

/** Détail d'une campagne dont je suis membre. */
export interface DetailCampagne extends BaseCampagne {
  ownerId: string;
  role: RoleCampagne;
  members: Membre[];
  memberCount: number;
  /** Invitations nominatives en attente (MJ seulement, vide sinon). */
  invitations: Invitation[];
  characters: Engagement[];
  playedCharacterId: string | null;
  version: number;
  createdAt: string;
}

export interface PageCampagnesPubliques {
  campagnes: Campagne[];
  page: number;
  parPage: number;
  total: number;
}

export interface NouvelleCampagne {
  name: string;
  pitch: string;
  description: string;
  /** Couverture de la bibliothèque (ou null) ; une image importée passe par `couverture`. */
  coverUrl: string | null;
  /** Image importée, envoyée au stockage une fois la campagne créée. */
  couverture: File | null;
  system: string;
  ambiance: Ambiance;
  visibility: Visibilite;
  freeCreation: boolean;
  tags: string[];
  /** Amis invités nominativement dès la création. */
  invite: Personne[];
}

export type ModificationCampagne = Partial<
  Pick<
    DetailCampagne,
    | 'name'
    | 'pitch'
    | 'description'
    | 'coverUrl'
    | 'ambiance'
    | 'visibility'
    | 'freeCreation'
    | 'tags'
  >
>;

export const LONGUEUR_CODE = 6;
export const LONGUEUR_ACCROCHE = 140;
export const LONGUEUR_DESCRIPTION = 2000;
export const PAR_PAGE_PUBLIQUES = 20;

// ─── Adaptateur API → UI ─────────────────────────────────────────────────────

const AMBIANCE_DE: Record<AccentApi, Ambiance> = {
  gold: 'or',
  ember: 'braise',
  arcane: 'arcane',
  sylvan: 'sylve',
  frost: 'givre',
  blood: 'sang',
};

const ACCENT_DE: Record<Ambiance, AccentApi> = {
  or: 'gold',
  braise: 'ember',
  arcane: 'arcane',
  sylve: 'sylvan',
  givre: 'frost',
  sang: 'blood',
};

/** Nom affiché d'un utilisateur dont identity n'a pas donné le profil. */
const NOM_INCONNU = 'Joueur';

function versPersonne(u: UserRefApi): Personne {
  return { id: u.id, name: u.name ?? NOM_INCONNU, avatarUrl: u.avatarUrl };
}

function versMembre(m: MemberApi, engagements: EngagementApi[] = []): Membre {
  return {
    userId: m.userId,
    name: m.name ?? NOM_INCONNU,
    avatarUrl: m.avatarUrl,
    role: m.role,
    characterId: engagements.find((e) => e.playedBy === m.userId)?.characterId ?? null,
  };
}

function versSession(s: SessionApi): SessionPrevue {
  return { id: s.id, startsAt: s.date, title: s.title };
}

function versBase(c: CampaignFieldsApi): BaseCampagne {
  return {
    id: c.id,
    name: c.name,
    pitch: c.pitch,
    description: c.description,
    coverUrl: c.imageUrl,
    system: c.system.id,
    systemVersion: c.system.version,
    ambiance: AMBIANCE_DE[c.accent] ?? 'or',
    visibility: c.isPublic ? 'public' : 'private',
    freeCreation: c.characterCreation,
    tags: c.tags,
    code: c.code,
    owner: versPersonne(c.owner),
    playerCount: c.playerCount,
    updatedAt: c.updatedAt,
  };
}

function versCampagne(c: CampaignSummaryApi | MyCampaignSummaryApi): Campagne {
  const mienne = 'characterIds' in c;
  return {
    ...versBase(c),
    role: c.role,
    memberCount: c.memberCount,
    // Aperçu : le personnage incarné n'est connu que pour moi (playedCharacterId)
    members: mienne ? c.members.map((m) => versMembre(m)) : [],
    nextSession: mienne && c.nextSession ? versSession(c.nextSession) : null,
    playedCharacterId: mienne ? c.playedCharacterId : null,
    characterIds: mienne ? c.characterIds : [],
  };
}

function versInvitation(c: InvitedCampaignApi): InvitationRecue {
  return { ...versCampagne(c), invitedBy: versPersonne(c.invitedBy), invitedAt: c.invitedAt };
}

function versDetail(c: CampaignApi): DetailCampagne {
  return {
    ...versBase(c),
    ownerId: c.ownerId,
    role: c.role,
    members: c.members.map((m) => versMembre(m, c.characters)),
    memberCount: c.members.length,
    invitations: c.invitees.map((i) => ({
      userId: i.userId,
      name: i.name ?? NOM_INCONNU,
      avatarUrl: i.avatarUrl,
      invitedAt: i.invitedAt,
    })),
    characters: c.characters.map((e) => ({
      characterId: e.characterId,
      ownerId: e.ownerId,
      side: e.side,
      playedBy: e.playedBy,
    })),
    playedCharacterId: c.playedCharacterId,
    version: c.version,
    createdAt: c.createdAt,
  };
}

/** Corps de POST/PATCH : champs de l'UI traduits dans le contrat de l'API. */
function versCorps(m: ModificationCampagne): Record<string, unknown> {
  return {
    ...(m.name !== undefined ? { name: m.name.trim() } : {}),
    ...(m.pitch !== undefined ? { pitch: m.pitch.trim() } : {}),
    ...(m.description !== undefined ? { description: m.description.trim() } : {}),
    ...(m.coverUrl !== undefined ? { imageUrl: m.coverUrl } : {}),
    ...(m.ambiance !== undefined ? { accent: ACCENT_DE[m.ambiance] } : {}),
    ...(m.visibility !== undefined ? { isPublic: m.visibility === 'public' } : {}),
    ...(m.freeCreation !== undefined ? { characterCreation: m.freeCreation } : {}),
    ...(m.tags !== undefined ? { tags: m.tags } : {}),
  };
}

// ─── Accès au service ────────────────────────────────────────────────────────

const url = (id: string, suite = '') => `/v1/campaigns/${encodeURIComponent(id)}${suite}`;
const json = (corps: unknown) => ({ body: JSON.stringify(corps) });

export const campagnes = {
  lister: async () => (await api<MyCampaignSummaryApi[]>('/v1/campaigns')).map(versCampagne),

  lire: async (id: string) => versDetail(await api<CampaignApi>(url(id))),

  publiques: async (recherche: string, page: number): Promise<PageCampagnesPubliques> => {
    const params = new URLSearchParams({ page: String(page) });
    if (recherche.trim()) params.set('search', recherche.trim());
    const r = await api<PublicPageApi>(`/v1/campaigns/public?${params}`);
    return {
      campagnes: r.campaigns.map(versCampagne),
      page: r.page,
      parPage: r.perPage,
      total: r.total,
    };
  },

  invitations: async () =>
    (await api<InvitedCampaignApi[]>('/v1/campaigns/invited')).map(versInvitation),

  sessions: async (id: string) => (await api<SessionApi[]>(url(id, '/sessions'))).map(versSession),

  /**
   * Crée la campagne (couverture de la bibliothèque comprise), puis envoie la
   * couverture importée et invite les amis choisis.
   */
  async creer(n: NouvelleCampagne): Promise<DetailCampagne> {
    let c = versDetail(
      await api<CampaignApi>('/v1/campaigns', {
        method: 'POST',
        ...json({
          systemId: n.system,
          ...versCorps({
            name: n.name,
            pitch: n.pitch,
            description: n.description,
            coverUrl: n.couverture ? null : n.coverUrl,
            ambiance: n.ambiance,
            visibility: n.visibility,
            freeCreation: n.freeCreation,
            tags: n.tags,
          }),
        }),
      }),
    );
    if (n.couverture) c = await campagnes.envoyerCouverture(c.id, n.couverture);
    if (n.invite.length)
      c = await campagnes.inviter(
        c.id,
        n.invite.map((i) => i.id),
      );
    return c;
  },

  modifier: async (id: string, m: ModificationCampagne) =>
    versDetail(await api<CampaignApi>(url(id), { method: 'PATCH', ...json(versCorps(m)) })),

  /**
   * Envoie une image de couverture (route commune d'envoi, docs/uploads.md : compressée en
   * WebP, déposée sur le stockage), puis l'enregistre.
   */
  async envoyerCouverture(
    id: string,
    fichier: File,
    onProgress?: (p: UploadProgress) => void,
  ): Promise<DetailCampagne> {
    const pret = await prepareImage(fichier, { maxSide: MAX_SIDE['campaign-image'] });
    const publicUrl = await uploadFile(
      { kind: 'campaign', id },
      'campaign-image',
      pret,
      onProgress ? { onProgress } : {},
    );
    return campagnes.modifier(id, { coverUrl: publicUrl });
  },

  supprimer: (id: string) => api<void>(url(id), { method: 'DELETE' }),

  /** Rejoindre par code de campagne ou code d'invitation (`inv_…`). */
  rejoindre: async (code: string) =>
    versDetail(await api<CampaignApi>('/v1/campaigns/join', { method: 'POST', ...json({ code }) })),

  /** Rejoindre sans code : campagne publique, ou invitation nominative. */
  rejoindreSansCode: async (id: string) =>
    versDetail(await api<CampaignApi>(url(id, '/join'), { method: 'POST' })),

  inviter: async (id: string, userIds: string[]) =>
    versDetail(
      await api<CampaignApi>(url(id, '/invitees'), { method: 'POST', ...json({ userIds }) }),
    ),

  /** Le MJ annule une invitation, ou l'invité la décline (`userId` = lui-même). */
  retirerInvitation: (id: string, userId: string) =>
    api<void>(url(id, `/invitees/${encodeURIComponent(userId)}`), { method: 'DELETE' }),

  /** Quitter (soi-même) ou exclure un membre (MJ). */
  retirerMembre: (id: string, userId: string) =>
    api<void>(url(id, `/members/${encodeURIComponent(userId)}`), { method: 'DELETE' }),

  /** Personnage incarné (null : jouer en MJ) ; renvoie les personnages engagés. */
  incarner: (id: string, characterId: string | null) =>
    api<CampaignCharacterApi[]>(url(id, '/me/character'), {
      method: 'PUT',
      ...json({ characterId }),
    }),

  /** Engage un de mes personnages dans la campagne (du système de la campagne). */
  engager: async (id: string, characterId: string) =>
    versDetail(
      await api<CampaignApi>(url(id, '/characters'), {
        method: 'POST',
        ...json({ characterId }),
      }),
    ),

  desengager: (id: string, characterId: string) =>
    api<void>(url(id, `/characters/${encodeURIComponent(characterId)}`), { method: 'DELETE' }),

  /** Personnages engagés ; `kind` : seulement les personnages joueurs (`pc`) ou les PNJ. */
  personnages: (id: string, kind?: CharacterKindApi) =>
    api<CampaignCharacterApi[]>(
      url(id, `/characters${kind ? `?${new URLSearchParams({ kind })}` : ''}`),
    ),

  nouveauCode: async (id: string) =>
    versDetail(await api<CampaignApi>(url(id, '/code'), { method: 'POST' })),

  planifier: async (id: string, startsAt: string, title: string | null) =>
    versSession(
      await api<SessionApi>(url(id, '/sessions'), {
        method: 'POST',
        ...json({ date: startsAt, title }),
      }),
    ),

  deplanifier: (id: string, sessionId: string) =>
    api<void>(url(id, `/sessions/${encodeURIComponent(sessionId)}`), { method: 'DELETE' }),
};

// ─── Hooks de domaine ────────────────────────────────────────────────────────

export const clesCampagnes = {
  racine: ['campagnes'] as const,
  miennes: ['campagnes', 'miennes'] as const,
  une: (id: string) => ['campagnes', 'une', id] as const,
  sessions: (id: string) => ['campagnes', 'une', id, 'sessions'] as const,
  publiques: (recherche: string, page: number) =>
    ['campagnes', 'publiques', recherche.trim(), page] as const,
  toutesPubliques: ['campagnes', 'publiques'] as const,
  invitations: ['campagnes', 'invitations'] as const,
};

/** Clé des personnages engagés d'une campagne (domaine personnages, rafraîchie d'ici). */
export const clePersonnagesCampagne = (id: string) => ['personnages', 'campagne', id] as const;

/** Mes campagnes, les plus récemment modifiées d'abord. */
export function useCampagnes() {
  return useQuery({ queryKey: clesCampagnes.miennes, queryFn: campagnes.lister });
}

export function useCampagne(id: string | null | undefined) {
  return useQuery({
    queryKey: clesCampagnes.une(id ?? ''),
    queryFn: () => campagnes.lire(id!),
    enabled: Boolean(id),
  });
}

/** Sessions à venir, par date croissante. */
export function useSessionsCampagne(id: string | null | undefined) {
  return useQuery({
    queryKey: clesCampagnes.sessions(id ?? ''),
    queryFn: () => campagnes.sessions(id!),
    enabled: Boolean(id),
  });
}

/** Campagnes publiques : recherche (nom, description ou code) et pages de 20. */
export function useCampagnesPubliques(recherche: string, page: number, actif = true) {
  return useQuery({
    queryKey: clesCampagnes.publiques(recherche, page),
    queryFn: () => campagnes.publiques(recherche, page),
    placeholderData: keepPreviousData,
    enabled: actif,
  });
}

/** Invitations nominatives reçues, en attente. */
export function useInvitationsRecues() {
  return useQuery({ queryKey: clesCampagnes.invitations, queryFn: campagnes.invitations });
}

/** Après une écriture : le détail est remplacé, les listes rechargées. */
function useApresEcriture() {
  const client = useQueryClient();
  return (c: DetailCampagne | null, id?: string) => {
    if (c) client.setQueryData(clesCampagnes.une(c.id), c);
    else if (id) void client.invalidateQueries({ queryKey: clesCampagnes.une(id) });
    void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
    void client.invalidateQueries({ queryKey: clesCampagnes.toutesPubliques });
    void client.invalidateQueries({ queryKey: clesCampagnes.invitations });
  };
}

function useMutationCampagne<A>(action: (args: A) => Promise<DetailCampagne>) {
  const apres = useApresEcriture();
  return useMutation({ mutationFn: action, onSuccess: (c) => apres(c) });
}

export const useCreerCampagne = () => useMutationCampagne(campagnes.creer);
export const useRejoindreCampagne = () => useMutationCampagne(campagnes.rejoindre);
/** Rejoindre une campagne publique, ou accepter une invitation nominative. */
export const useRejoindreSansCode = () => useMutationCampagne(campagnes.rejoindreSansCode);
export const useModifierCampagne = (id: string) =>
  useMutationCampagne((m: ModificationCampagne) => campagnes.modifier(id, m));
export const useEnvoyerCouverture = (id: string) =>
  useMutationCampagne((f: File) => campagnes.envoyerCouverture(id, f));
export const useNouveauCode = (id: string) =>
  useMutationCampagne<void>(() => campagnes.nouveauCode(id));
export const useInviter = (id: string) =>
  useMutationCampagne((userIds: string[]) => campagnes.inviter(id, userIds));

/** Le MJ annule une invitation nominative. */
export function useAnnulerInvitation(id: string) {
  const apres = useApresEcriture();
  return useMutation({
    mutationFn: (userId: string) => campagnes.retirerInvitation(id, userId),
    onSuccess: () => apres(null, id),
  });
}

/** L'invité décline une invitation nominative. */
export function useDeclinerInvitation(moi: string) {
  const apres = useApresEcriture();
  return useMutation({
    mutationFn: (campagneId: string) => campagnes.retirerInvitation(campagneId, moi),
    onSuccess: () => apres(null),
  });
}

/** Le MJ exclut un membre (ses personnages quittent la campagne). */
export function useRetirerMembre(id: string) {
  const client = useQueryClient();
  const apres = useApresEcriture();
  return useMutation({
    mutationFn: (userId: string) => campagnes.retirerMembre(id, userId),
    onSuccess: () => {
      apres(null, id);
      void client.invalidateQueries({ queryKey: clePersonnagesCampagne(id) });
    },
  });
}

/** Choisit le personnage incarné (null : jouer en MJ). */
export function useIncarner(id: string) {
  const client = useQueryClient();
  const apres = useApresEcriture();
  return useMutation({
    mutationFn: (characterId: string | null) => campagnes.incarner(id, characterId),
    onSuccess: (engages) => {
      client.setQueryData(clePersonnagesCampagne(id), engages);
      apres(null, id);
    },
  });
}

export function usePlanifier(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (s: { startsAt: string; title: string | null }) =>
      campagnes.planifier(id, s.startsAt, s.title),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: clesCampagnes.sessions(id) });
      void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
    },
  });
}

export function useDeplanifier(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => campagnes.deplanifier(id, sessionId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: clesCampagnes.sessions(id) });
      void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
    },
  });
}

/** Supprimer (propriétaire) ou quitter : la campagne disparaît du cache. */
export function useSortirCampagne(id: string, moi: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mode: 'supprimer' | 'quitter') =>
      mode === 'supprimer' ? campagnes.supprimer(id) : campagnes.retirerMembre(id, moi),
    onSuccess: () => {
      client.removeQueries({ queryKey: clesCampagnes.une(id) });
      client.removeQueries({ queryKey: clePersonnagesCampagne(id) });
      void client.invalidateQueries({ queryKey: clesCampagnes.miennes });
      void client.invalidateQueries({ queryKey: clesCampagnes.toutesPubliques });
      // Mes personnages engagés redeviennent libres
      void client.invalidateQueries({ queryKey: ['personnages'] });
    },
  });
}
