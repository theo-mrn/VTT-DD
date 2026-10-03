/**
 * Notes : service campaign derrière la gateway (`/v1/notes/**`, contrat dans
 * docs/api-notes.md). Toutes les données viennent du service ; les réponses
 * passent par un adaptateur explicite vers les types de l'UI (type, étiquettes,
 * campagne, visibilité).
 *
 * - Une note appartient toujours à une campagne ; elle y est privée ou
 *   partagée (MJ, toute la table, personnages choisis). Le service dit ce que
 *   l'appelant peut en faire (`permissions`).
 * - Contenu : HTML de l'éditeur, assaini par le service à chaque écriture, et
 *   repassé à DOMPurify avant d'entrer dans l'éditeur (components/notes/sanitize.ts).
 * - Écritures avec la `version` connue : un 409 relit la note sans rien écraser
 *   (components/notes/enregistrement.ts).
 * - Mises à jour optimistes (note ouverte et listes), annulées sur un refus.
 * - Listes paginées par curseur ; recherche plein texte faite par le service.
 * - Temps réel : les événements `note.*` ne portent pas le texte ; ils
 *   invalident la note et les listes, qui se relisent (`useNotesSync`).
 */
'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, ApiError } from './api';
import { useCampaignEvents, type RealtimeEvent } from './realtime';
import { premiereFois, relireVersion } from './realtime-bridge';
import { randomId } from '@/lib/random-id';
import { stripTags } from '@/lib/strip-tags';

// ─── Contrat de l'API (schémas Zod de backend/campaign/src/modules/notes/schemas.ts) ─

type NoteTypeApi = 'character' | 'location' | 'item' | 'quest' | 'journal' | 'other';
export type QuestType = 'main' | 'side';
export type QuestStatus = 'not_started' | 'in_progress' | 'completed';

interface UserRefApi {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface TagApi {
  id: string;
  label: string;
}

export interface SubQuest {
  id: string;
  title: string;
  description: string;
  status: QuestStatus;
}

/** Ce que l'appelant peut faire de la note (calculé par le service). */
export interface NotePermissions {
  edit: boolean;
  delete: boolean;
  /** Changer la visibilité (dont la rendre privée) : l'auteur seul. */
  share: boolean;
  /** Changer de campagne : l'auteur seul. */
  move: boolean;
}

interface NoteCommonApi {
  id: string;
  campaignId: string;
  owner: UserRefApi;
  characterId: string | null;
  shared: boolean;
  sharedWith: 'all' | string[] | null;
  sharedWithGm: boolean;
  title: string;
  icon: string | null;
  type: NoteTypeApi;
  tags: TagApi[];
  imageUrl: string | null;
  pinned: boolean;
  permissions: NotePermissions;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface NoteApi extends NoteCommonApi {
  content: string;
  race: string | null;
  class: string | null;
  region: string | null;
  itemType: string | null;
  questType: QuestType | null;
  questStatus: QuestStatus | null;
  subQuests: SubQuest[];
}

interface NoteSummaryApi extends NoteCommonApi {
  excerpt: string;
}

interface NotePageApi {
  items: NoteSummaryApi[];
  nextCursor: string | null;
  total: number | null;
}

interface NoteFacetsApi {
  total: number;
  pinned: number;
  types: Record<NoteTypeApi, number>;
  campaigns: { campaignId: string; count: number }[];
  tags: { label: string; count: number }[];
}

// ─── Types de l'UI ───────────────────────────────────────────────────────────

export type TypeNote = 'libre' | 'personnage' | 'lieu' | 'objet' | 'quete' | 'journal';
/**
 * `private` : l'auteur seul ; `gm` : l'auteur et le MJ ; `room` : toute la
 * campagne ; `characters` : les joueurs de personnages choisis (et le MJ si
 * `sharedWithGm`).
 */
export type VisibiliteNote = 'private' | 'gm' | 'room' | 'characters';

/** Champs structurés repris de l'ancien Grimoire (selon le type de la note). */
export interface NoteDetails {
  race: string | null;
  class: string | null;
  region: string | null;
  itemType: string | null;
  questType: QuestType | null;
  questStatus: QuestStatus | null;
  subQuests: SubQuest[];
}

interface BaseNote {
  id: string;
  title: string;
  /** Un emoji ; null : celui du type. */
  icon: string | null;
  kind: TypeNote;
  tags: string[];
  /** Épinglée par moi (préférence personnelle). */
  pinned: boolean;
  /** Campagne de la note (toujours une). */
  roomId: string;
  visibility: VisibiliteNote;
  /** Personnages destinataires (visibilité `characters`). */
  sharedWith: string[];
  /** Le MJ lit aussi la note (visibilité `characters`). */
  sharedWithGm: boolean;
  authorId: string;
  authorName: string;
  /** Personnage incarné par l'auteur quand il l'a écrite. */
  characterId: string | null;
  /** Image d'en-tête (ancien Grimoire). */
  imageUrl: string | null;
  permissions: NotePermissions;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Note dans une liste : sans le texte, avec un extrait. */
export interface ResumeNote extends BaseNote {
  /** Aperçu, ou extrait centré sur la recherche. */
  excerpt: string;
}

/** Note complète (éditeur). */
export interface Note extends BaseNote {
  /** HTML de l'éditeur, assaini par le service. */
  content: string;
  details: NoteDetails;
  /** Étiquettes avec leur identifiant (gardé d'une écriture à l'autre). */
  tagRefs: TagApi[];
}

export type ModificationNote = Partial<
  Pick<
    Note,
    | 'title'
    | 'content'
    | 'icon'
    | 'kind'
    | 'tags'
    | 'roomId'
    | 'visibility'
    | 'sharedWith'
    | 'sharedWithGm'
    | 'imageUrl'
  > & { details: Partial<NoteDetails> }
>;

/** Nouvelle note : sa campagne (obligatoire), ses champs de départ et son épingle. */
export type NouvelleNote = ModificationNote & { roomId: string; pinned?: boolean };

/** Filtres de l'espace Notes (appliqués par le service). */
export interface FiltresNotes {
  /** Id de campagne ; null : toutes mes campagnes. */
  campagne: string | null;
  type: TypeNote | null;
  epinglees: boolean;
  recherche: string;
}

export interface FacettesNotes {
  total: number;
  epinglees: number;
  types: Record<TypeNote, number>;
  /** Nombre de notes par campagne. */
  campagnes: Map<string, number>;
  /** Étiquettes, les plus utilisées d'abord. */
  etiquettes: string[];
}

export interface PageNotes {
  items: ResumeNote[];
  nextCursor: string | null;
  /** Notes correspondant aux filtres (première page seulement). */
  total: number | null;
}

export const TYPES_NOTE: { id: TypeNote; label: string; icone: string }[] = [
  { id: 'libre', label: 'Note', icone: '📝' },
  { id: 'journal', label: 'Journal', icone: '📖' },
  { id: 'quete', label: 'Quête', icone: '🧭' },
  { id: 'personnage', label: 'Personnage', icone: '🧙' },
  { id: 'lieu', label: 'Lieu', icone: '🏰' },
  { id: 'objet', label: 'Objet', icone: '🗝️' },
];

/** Bornes du service (docs/api-notes.md). */
export const LIMITES_NOTE = { titre: 200, contenu: 200_000, parPage: 50 } as const;

/** Emoji d'une note : le sien, sinon celui de son type. */
export function iconeNote(n: Pick<BaseNote, 'icon' | 'kind'>): string {
  return n.icon ?? TYPES_NOTE.find((t) => t.id === n.kind)?.icone ?? '📝';
}

/** Texte brut d'un HTML de note (aperçus, statistiques) : jamais interprété comme HTML. */
export function texteNote(html: string): string {
  return stripTags(html.replace(/<(br|\/p|\/h\d|\/li)>/gi, ' '))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aperçu d'une note, comme le calcule le service : texte sans les intertitres. */
export function apercuNote(html: string, longueur = 280): string {
  const texte = texteNote(html.replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, ' '));
  return texte.length > longueur ? `${texte.slice(0, longueur).trimEnd()}…` : texte;
}

// ─── Adaptateur API → UI ─────────────────────────────────────────────────────

const TYPE_API: Record<TypeNote, NoteTypeApi> = {
  libre: 'other',
  personnage: 'character',
  lieu: 'location',
  objet: 'item',
  quete: 'quest',
  journal: 'journal',
};

const TYPE_UI: Record<NoteTypeApi, TypeNote> = {
  other: 'libre',
  character: 'personnage',
  location: 'lieu',
  item: 'objet',
  quest: 'quete',
  journal: 'journal',
};

/** Nom affiché d'un auteur dont identity n'a pas donné le profil. */
const NOM_INCONNU = 'Joueur';

function visibiliteDe(
  n: NoteCommonApi,
): Pick<BaseNote, 'visibility' | 'sharedWith' | 'sharedWithGm'> {
  if (!n.shared || n.sharedWith === null)
    return { visibility: 'private', sharedWith: [], sharedWithGm: false };
  if (n.sharedWith === 'all') return { visibility: 'room', sharedWith: [], sharedWithGm: false };
  if (!n.sharedWith.length) return { visibility: 'gm', sharedWith: [], sharedWithGm: true };
  return { visibility: 'characters', sharedWith: n.sharedWith, sharedWithGm: n.sharedWithGm };
}

function versBase(n: NoteCommonApi): BaseNote {
  return {
    id: n.id,
    title: n.title,
    icon: n.icon,
    kind: TYPE_UI[n.type] ?? 'libre',
    tags: n.tags.map((t) => t.label),
    pinned: n.pinned,
    roomId: n.campaignId,
    ...visibiliteDe(n),
    authorId: n.owner.id,
    authorName: n.owner.name ?? NOM_INCONNU,
    characterId: n.characterId,
    imageUrl: n.imageUrl,
    permissions: n.permissions,
    version: n.version,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

function versNote(n: NoteApi): Note {
  return {
    ...versBase(n),
    content: n.content,
    tagRefs: n.tags,
    details: {
      race: n.race,
      class: n.class,
      region: n.region,
      itemType: n.itemType,
      questType: n.questType,
      questStatus: n.questStatus,
      subQuests: n.subQuests,
    },
  };
}

function versResume(n: NoteSummaryApi): ResumeNote {
  return { ...versBase(n), excerpt: n.excerpt };
}

/** Résumé d'une note complète (listes mises à jour sans recharger). */
export function resumeDe(n: Note): ResumeNote {
  const { content, details: _d, tagRefs: _t, ...base } = n;
  return { ...base, excerpt: apercuNote(content) };
}

function versFacettes(f: NoteFacetsApi): FacettesNotes {
  const types = Object.fromEntries(TYPES_NOTE.map((t) => [t.id, f.types[TYPE_API[t.id]] ?? 0]));
  return {
    total: f.total,
    epinglees: f.pinned,
    types: types as Record<TypeNote, number>,
    campagnes: new Map(f.campaigns.map((c) => [c.campaignId, c.count])),
    etiquettes: f.tags.map((t) => t.label),
  };
}

const nouvelId = () => randomId();

/** Étiquettes de l'UI (libellés) → API : l'identifiant d'une étiquette connue est gardé. */
function versTags(labels: string[], connues: TagApi[]): TagApi[] {
  return labels.map((label) => connues.find((t) => t.label === label) ?? { id: nouvelId(), label });
}

/** Partage de l'API pour une visibilité de l'UI. */
function versPartage(m: ModificationNote): Record<string, unknown> {
  switch (m.visibility) {
    case 'gm':
      return { shared: true, sharedWith: [], sharedWithGm: true };
    case 'room':
      return { shared: true, sharedWith: 'all' };
    case 'characters':
      return {
        shared: true,
        sharedWith: m.sharedWith ?? [],
        sharedWithGm: m.sharedWithGm ?? false,
      };
    default:
      return { shared: false };
  }
}

/** Corps de POST/PATCH : champs de l'UI traduits dans le contrat de l'API. */
function versCorps(m: ModificationNote, tagsConnus: TagApi[]): Record<string, unknown> {
  const d = m.details ?? {};
  const corps: Record<string, unknown> = {
    ...(m.title !== undefined ? { title: m.title } : {}),
    ...(m.content !== undefined ? { content: m.content } : {}),
    ...(m.icon !== undefined ? { icon: m.icon } : {}),
    ...(m.kind !== undefined ? { type: TYPE_API[m.kind] } : {}),
    ...(m.tags !== undefined ? { tags: versTags(m.tags, tagsConnus) } : {}),
    ...(m.imageUrl !== undefined ? { imageUrl: m.imageUrl } : {}),
    ...(m.roomId !== undefined ? { campaignId: m.roomId } : {}),
    ...(m.visibility !== undefined ? versPartage(m) : {}),
  };
  for (const cle of [
    'race',
    'class',
    'region',
    'itemType',
    'questType',
    'questStatus',
    'subQuests',
  ] as const)
    if (d[cle] !== undefined) corps[cle] = d[cle];
  return corps;
}

// ─── Accès au service ────────────────────────────────────────────────────────

const url = (id: string, suite = '') => `/v1/notes/${encodeURIComponent(id)}${suite}`;
const json = (corps: unknown) => ({ body: JSON.stringify(corps) });

function parametres(f: FiltresNotes, cursor: string | null, limit: number): string {
  const p = new URLSearchParams({ limit: String(limit) });
  if (f.campagne) p.set('campaignId', f.campagne);
  if (f.type) p.set('type', TYPE_API[f.type]);
  if (f.epinglees) p.set('pinned', 'true');
  if (f.recherche.trim()) p.set('q', f.recherche.trim());
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

export const notes = {
  async page(f: FiltresNotes, cursor: string | null, limit: number): Promise<PageNotes> {
    const r = await api<NotePageApi>(`/v1/notes?${parametres(f, cursor, limit)}`);
    return { items: r.items.map(versResume), nextCursor: r.nextCursor, total: r.total };
  },

  facettes: async () => versFacettes(await api<NoteFacetsApi>('/v1/notes/facets')),

  lire: async (id: string) => versNote(await api<NoteApi>(url(id))),

  /** Crée la note dans sa campagne, puis l'épingle si demandé. */
  async creer(n: NouvelleNote): Promise<Note> {
    const { pinned, roomId, ...m } = n;
    const note = versNote(
      await api<NoteApi>(`/v1/campaigns/${encodeURIComponent(roomId)}/notes`, {
        method: 'POST',
        ...json(versCorps(m, [])),
      }),
    );
    if (!pinned) return note;
    await notes.epingler(note.id, true);
    return { ...note, pinned: true };
  },

  /** Modifie la note à partir de `version` (409 `version_conflict` si elle a changé). */
  modifier: async (id: string, m: ModificationNote, version: number, tagsConnus: TagApi[]) =>
    versNote(
      await api<NoteApi>(url(id), {
        method: 'PATCH',
        ...json({ ...versCorps(m, tagsConnus), version }),
      }),
    ),

  supprimer: (id: string) => api<void>(url(id), { method: 'DELETE' }),

  epingler: (id: string, pinned: boolean) =>
    api<void>(url(id, '/pin'), { method: pinned ? 'PUT' : 'DELETE' }),
};

/** Vrai si l'erreur est un conflit de version (la note a changé ailleurs). */
export const estConflit = (err: unknown) =>
  err instanceof ApiError && err.status === 409 && err.problem.code === 'version_conflict';

/** Vrai si la note n'est plus lisible (supprimée, plus partagée avec moi). */
export const estIntrouvable = (err: unknown) =>
  err instanceof ApiError && (err.status === 404 || err.status === 403);

// ─── Cache ───────────────────────────────────────────────────────────────────

export const clesNotes = {
  racine: ['notes'] as const,
  listes: ['notes', 'liste'] as const,
  espace: (f: FiltresNotes) =>
    ['notes', 'liste', 'espace', f.campagne, f.type, f.epinglees, f.recherche.trim()] as const,
  recentes: (campagne: string | null, limit: number) =>
    ['notes', 'liste', 'recentes', campagne, limit] as const,
  facettes: ['notes', 'facettes'] as const,
  une: (id: string) => ['notes', 'une', id] as const,
};

type DonneesListe = InfiniteData<PageNotes, string | null> | ResumeNote[];

/** Applique `f` aux notes de toutes les listes en cache (espace et récentes). */
function majListes(client: QueryClient, f: (items: ResumeNote[]) => ResumeNote[]) {
  client.setQueriesData<DonneesListe>({ queryKey: clesNotes.listes }, (d) => {
    if (!d) return d;
    if (Array.isArray(d)) return f(d);
    return { ...d, pages: d.pages.map((p) => ({ ...p, items: f(p.items) })) };
  });
}

/** Instantané de la note et des listes, pour annuler une mise à jour optimiste. */
interface Instantane {
  une?: { cle: QueryKey; note: Note | undefined };
  listes: [QueryKey, unknown][];
}

async function prendreInstantane(client: QueryClient, id: string): Promise<Instantane> {
  await client.cancelQueries({ queryKey: clesNotes.une(id) });
  return {
    une: { cle: clesNotes.une(id), note: client.getQueryData<Note>(clesNotes.une(id)) },
    listes: client.getQueriesData({ queryKey: clesNotes.listes }),
  };
}

function restaurer(client: QueryClient, i: Instantane | undefined) {
  if (!i) return;
  if (i.une?.note) client.setQueryData(i.une.cle, i.une.note);
  for (const [cle, donnees] of i.listes) client.setQueryData(cle, donnees);
}

/** Champs visibles dans les listes, appliqués tout de suite (mise à jour optimiste). */
function champsListe(m: ModificationNote): Partial<ResumeNote> {
  return {
    ...(m.title !== undefined ? { title: m.title } : {}),
    ...(m.icon !== undefined ? { icon: m.icon } : {}),
    ...(m.kind !== undefined ? { kind: m.kind } : {}),
    ...(m.tags !== undefined ? { tags: m.tags } : {}),
    ...(m.roomId !== undefined ? { roomId: m.roomId } : {}),
    ...(m.visibility !== undefined ? { visibility: m.visibility } : {}),
    ...(m.content !== undefined ? { excerpt: apercuNote(m.content) } : {}),
  };
}

/**
 * Réponse du service : la note ouverte et les listes prennent la version
 * enregistrée. L'extrait d'une liste (centré sur une recherche) n'est remplacé
 * que si le texte a changé.
 */
function enregistree(client: QueryClient, note: Note, o: { contenu: boolean; facettes: boolean }) {
  client.setQueryData(clesNotes.une(note.id), note);
  const resume = resumeDe(note);
  majListes(client, (items) =>
    items.map((n) =>
      n.id === note.id ? { ...resume, excerpt: o.contenu ? resume.excerpt : n.excerpt } : n,
    ),
  );
  // Ordre et appartenance aux filtres : relus à la prochaine consultation
  void client.invalidateQueries({ queryKey: clesNotes.listes, refetchType: 'none' });
  if (o.facettes) void client.invalidateQueries({ queryKey: clesNotes.facettes });
}

// ─── Hooks de domaine ────────────────────────────────────────────────────────

/** Espace Notes : pages de notes filtrées par le service (recherche comprise). */
export function useNotesListe(f: FiltresNotes) {
  return useInfiniteQuery({
    queryKey: clesNotes.espace(f),
    queryFn: ({ pageParam }) => notes.page(f, pageParam, LIMITES_NOTE.parPage),
    initialPageParam: null as string | null,
    getNextPageParam: (derniere) => derniere.nextCursor,
    placeholderData: keepPreviousData,
  });
}

/**
 * Notes récentes (accueil, salon, palette) : épinglées puis les plus récemment
 * modifiées, d'une campagne ou de partout.
 */
export function useNotes(o: { campaignId?: string | null; limit?: number } = {}) {
  const campagne = o.campaignId ?? null;
  const limit = o.limit ?? 12;
  return useQuery({
    queryKey: clesNotes.recentes(campagne, limit),
    queryFn: async () =>
      (await notes.page({ campagne, type: null, epinglees: false, recherche: '' }, null, limit))
        .items,
  });
}

/** Compteurs et étiquettes de toutes mes notes (filtres, suggestions). */
export function useFacettesNotes() {
  return useQuery({ queryKey: clesNotes.facettes, queryFn: notes.facettes });
}

/** Une note complète ; pas de nouvel essai si elle est introuvable. */
export function useNote(id: string | null | undefined) {
  return useQuery({
    queryKey: clesNotes.une(id ?? ''),
    queryFn: () => notes.lire(id!),
    enabled: Boolean(id),
    retry: (essais, err) => !estIntrouvable(err) && essais < 1,
  });
}

export function useCreerNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (n: NouvelleNote) => notes.creer(n),
    onSuccess: (note) => {
      client.setQueryData(clesNotes.une(note.id), note);
      void client.invalidateQueries({ queryKey: clesNotes.listes });
      void client.invalidateQueries({ queryKey: clesNotes.facettes });
    },
  });
}

export interface DemandeModification {
  id: string;
  patch: ModificationNote;
  /** Version sur laquelle repose la modification (celle de l'éditeur). */
  version: number;
  /** Étiquettes connues (leur identifiant est gardé). */
  tagRefs: TagApi[];
}

/**
 * Modification (enregistrement automatique) : appliquée tout de suite à la
 * note et aux listes, annulée si le service la refuse. Un conflit de version
 * est rendu tel quel : l'appelant relit la note et prévient.
 */
export function useModifierNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (d: DemandeModification) => notes.modifier(d.id, d.patch, d.version, d.tagRefs),
    onMutate: async ({ id, patch }) => {
      const instantane = await prendreInstantane(client, id);
      const { details, ...champs } = patch;
      client.setQueryData<Note>(clesNotes.une(id), (n) =>
        n ? { ...n, ...champs, details: { ...n.details, ...details } } : n,
      );
      const liste = champsListe(patch);
      majListes(client, (items) => items.map((n) => (n.id === id ? { ...n, ...liste } : n)));
      return instantane;
    },
    onError: (_err, _d, instantane) => restaurer(client, instantane),
    onSuccess: (note, { patch }) =>
      enregistree(client, note, {
        contenu: patch.content !== undefined,
        facettes:
          patch.kind !== undefined || patch.tags !== undefined || patch.roomId !== undefined,
      }),
  });
}

/** Suppression : la note disparaît tout de suite des listes, et revient sur un refus. */
export function useSupprimerNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notes.supprimer(id),
    onMutate: async (id) => {
      const instantane = await prendreInstantane(client, id);
      majListes(client, (items) => items.filter((n) => n.id !== id));
      return instantane;
    },
    onError: (_err, _id, instantane) => restaurer(client, instantane),
    onSuccess: (_r, id) => client.removeQueries({ queryKey: clesNotes.une(id) }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: clesNotes.listes, refetchType: 'none' });
      void client.invalidateQueries({ queryKey: clesNotes.facettes });
    },
  });
}

/** Épingle (pour moi seul) : appliquée tout de suite, annulée sur un refus. */
export function useEpinglerNote() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => notes.epingler(id, pinned),
    onMutate: async ({ id, pinned }) => {
      const instantane = await prendreInstantane(client, id);
      client.setQueryData<Note>(clesNotes.une(id), (n) => (n ? { ...n, pinned } : n));
      majListes(client, (items) => items.map((n) => (n.id === id ? { ...n, pinned } : n)));
      return instantane;
    },
    onError: (_err, _d, instantane) => restaurer(client, instantane),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: clesNotes.listes });
      void client.invalidateQueries({ queryKey: clesNotes.facettes });
    },
  });
}

// ─── Temps réel ──────────────────────────────────────────────────────────────

const TYPES_TEMPS_REEL = ['note.*'] as const;

/**
 * Applique un événement `note.*` au cache. Il ne porte pas le texte : la note
 * est relue en REST (déjà masquée comme il faut par le service), sauf si le
 * cache a déjà sa version (c'est notre propre écriture).
 */
export function appliquerEvenementNote(client: QueryClient, e: RealtimeEvent): void {
  const { type, aggregate, payload } = e.event;
  const id = aggregate.id;

  if (type === 'note.deleted') {
    majListes(client, (items) => items.filter((n) => n.id !== id));
    client.removeQueries({ queryKey: clesNotes.une(id) });
    void client.invalidateQueries({ queryKey: clesNotes.facettes });
    return;
  }

  const connue = client.getQueryData<Note>(clesNotes.une(id));
  if (type === 'note.pinned' || type === 'note.unpinned') {
    // Déjà à jour : l'épingle vient de cet onglet
    if (connue && connue.pinned === (type === 'note.pinned')) return;
  } else if (type === 'note.created' || type === 'note.updated') {
    const version = typeof payload.version === 'number' ? payload.version : null;
    if (connue && version !== null && connue.version >= version) return;
  }
  if (type === 'note.updated') {
    noteChangeeAilleurs(client, id, typeof payload.version === 'number' ? payload.version : null);
    return;
  }
  void client.invalidateQueries({ queryKey: clesNotes.une(id) });
  void client.invalidateQueries({ queryKey: clesNotes.listes });
  void client.invalidateQueries({ queryKey: clesNotes.facettes });
}

/** Relectures regroupées, par cache : une seule part au bout du délai, quel que soit le flot. */
const regroupees = new WeakMap<QueryClient, Set<string>>();
function plusTard(client: QueryClient, cle: string, ms: number, relire: () => void) {
  let enAttente = regroupees.get(client);
  if (!enAttente) regroupees.set(client, (enAttente = new Set()));
  if (enAttente.has(cle)) return;
  enAttente.add(cle);
  setTimeout(() => {
    enAttente.delete(cle);
    relire();
  }, ms);
}

/** Délai des relectures déclenchées par l'enregistrement automatique d'un collègue. */
const DELAI_RELECTURE_MS = 2_000;

/**
 * Note modifiée par un collègue (l'enregistrement automatique en publie une toutes les
 * 600 ms pendant qu'il écrit). Ouverte ici : relue, puis reportée dans les listes, qui
 * sont seulement marquées périmées. Fermée : marquée périmée, et les listes affichées
 * relues au plus une fois par délai. Les facettes aussi, au plus une fois par délai.
 */
function noteChangeeAilleurs(client: QueryClient, id: string, version: number | null) {
  const cle = clesNotes.une(id);
  const ouverte =
    (client.getQueryCache().find({ queryKey: cle, exact: true })?.getObserversCount() ?? 0) > 0;
  if (ouverte) {
    void relireVersion<Note>(client, cle, version, (n) => n.version).then(() => {
      const note = client.getQueryData<Note>(cle);
      if (!note) return;
      const resume = resumeDe(note);
      majListes(client, (items) => items.map((n) => (n.id === id ? resume : n)));
      void client.invalidateQueries({ queryKey: clesNotes.listes, refetchType: 'none' });
    });
  } else {
    void client.invalidateQueries({ queryKey: cle });
    plusTard(client, 'listes', DELAI_RELECTURE_MS, () => {
      void client.invalidateQueries({ queryKey: clesNotes.listes });
    });
  }
  plusTard(client, 'facettes', DELAI_RELECTURE_MS, () => {
    void client.invalidateQueries({ queryKey: clesNotes.facettes });
  });
}

/**
 * Tient les notes à jour en direct : événements d'une campagne, ou événements
 * personnels (`campaignId` null : mes épingles, posées dans un autre onglet). À chaque (ré)abonnement
 * sans rejeu possible, les notes sont relues.
 */
export function useNotesSync(campaignId: string | null, enabled = true): { live: boolean } {
  const client = useQueryClient();
  const { live, generation } = useCampaignEvents(
    campaignId,
    TYPES_TEMPS_REEL,
    (e) => {
      if (premiereFois(client, 'notes', e)) appliquerEvenementNote(client, e);
    },
    { enabled },
  );
  useEffect(() => {
    if (!enabled || generation === 0) return;
    // Plusieurs campagnes suivies se (ré)abonnent ensemble : une seule relecture
    plusTard(client, 'racine', 100, () => {
      void client.invalidateQueries({ queryKey: clesNotes.racine });
    });
  }, [client, enabled, generation]);
  return { live };
}
