/**
 * Schémas Zod du module « notes » : champs écrits, représentations API
 * (note complète, résumé des listes, facettes) et paramètres des listes.
 */
import { z } from 'zod';
import { NOTE_TYPES, QUEST_STATUSES, QUEST_TYPES } from '../../db/schema.js';
import { CampaignId, UserRef, Uuid } from '../schemas.js';

/** Bornes (contraintes de 0009-notes.sql, 0012-personal-notes.sql et 0013-notes-search.sql). */
export const LIMITS = {
  title: 200,
  /** HTML de l'éditeur, avant et après assainissement. */
  content: 200_000,
  detail: 200,
  tags: 50,
  tagLabel: 100,
  subQuests: 100,
  sharedWith: 100,
  /** Icône : un seul emoji (graphème), 32 caractères au plus. */
  icon: 32,
  /** Notes par auteur, toutes campagnes confondues. */
  notesPerAuthor: 5000,
  /** Recherche : longueur de la requête. */
  query: 200,
  pageDefault: 50,
  pageMax: 100,
  /** Étiquettes renvoyées par les facettes (les plus utilisées). */
  facetTags: 200,
} as const;

export const NoteId = Uuid('Identifiant de note invalide');

/**
 * Image d'en-tête : URL https ou chemin absolu du site (comme les médias de la
 * carte), ou fichier de notre stockage (`R2_PUBLIC_URL`, en http en dev).
 */
const imageUrl = (base: string | null) =>
  z
    .string()
    .trim()
    .max(2048, '2048 caractères au plus')
    .refine(
      (u) =>
        /^https:\/\/\S+$/.test(u) ||
        /^\/[^/]\S*$/.test(u) ||
        (!!base && u.startsWith(`${base}/`) && !/\s/.test(u)),
      { message: 'URL https ou chemin absolu attendu' },
    );

const Tag = z.strictObject({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(LIMITS.tagLabel),
});

const SubQuest = z.strictObject({
  id: z.string().trim().min(1).max(100),
  title: z.string().max(500),
  description: z.string().max(5000),
  status: z.enum(QUEST_STATUSES),
});

const Detail = z.string().trim().max(LIMITS.detail).nullable();

const graphemes = new Intl.Segmenter('fr', { granularity: 'grapheme' });

/** Un emoji : un seul graphème pictographique (drapeaux et touches compris). */
export const Icon = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.icon, `${LIMITS.icon} caractères au plus`)
  .refine(
    (s) =>
      [...graphemes.segment(s)].length === 1 &&
      /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(s),
    { message: 'Un seul emoji attendu' },
  );

/** Champs d'une note écrits par POST et PATCH. */
export const noteFields = (base: string | null) => ({
  title: z.string().trim().max(LIMITS.title, `${LIMITS.title} caractères au plus`),
  /** HTML de l'éditeur : assaini par le service avant d'être enregistré. */
  content: z.string().max(LIMITS.content, `${LIMITS.content} caractères au plus`),
  icon: Icon.nullable(),
  type: z.enum(NOTE_TYPES),
  tags: z
    .array(Tag)
    .max(LIMITS.tags)
    .refine((t) => new Set(t.map((x) => x.id)).size === t.length, {
      message: 'Étiquettes en double',
    }),
  imageUrl: imageUrl(base).nullable(),
  race: Detail,
  class: Detail,
  region: Detail,
  itemType: Detail,
  questType: z.enum(QUEST_TYPES).nullable(),
  questStatus: z.enum(QUEST_STATUSES).nullable(),
  subQuests: z.array(SubQuest).max(LIMITS.subQuests),
});

/**
 * Personnages destinataires : tous (`'all'`) ou des personnages engagés dans la
 * campagne ; liste vide permise avec `sharedWithGm` (les MJ seulement).
 */
export const SharedWith = z.union([
  z.literal('all'),
  z.array(Uuid('Identifiant de personnage invalide')).max(LIMITS.sharedWith),
]);

/** Partage d'une note : `shared`, destinataires et MJ. */
export const sharingFields = {
  shared: z.boolean(),
  sharedWith: SharedWith,
  sharedWithGm: z.boolean(),
};

/** Ce que l'appelant peut faire de la note (calculé par le service, le front s'y fie). */
export const Permissions = z.object({
  /** Modifier le texte et les champs. */
  edit: z.boolean(),
  delete: z.boolean(),
  /** Changer la visibilité (dont la rendre privée) : l'auteur seul. */
  share: z.boolean(),
  /** Changer la note de campagne : l'auteur seul. */
  move: z.boolean(),
});

const common = {
  id: z.string(),
  campaignId: z.string(),
  owner: UserRef,
  characterId: z.string().nullable(),
  shared: z.boolean(),
  sharedWith: z.union([z.literal('all'), z.array(z.string())]).nullable(),
  sharedWithGm: z.boolean(),
  title: z.string(),
  icon: z.string().nullable(),
  type: z.enum(NOTE_TYPES),
  tags: z.array(z.object({ id: z.string(), label: z.string() })),
  imageUrl: z.string().nullable(),
  /** Épinglée par l'appelant (préférence personnelle). */
  pinned: z.boolean(),
  permissions: Permissions,
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export const Note = z.object({
  ...common,
  content: z.string(),
  race: z.string().nullable(),
  class: z.string().nullable(),
  region: z.string().nullable(),
  itemType: z.string().nullable(),
  questType: z.enum(QUEST_TYPES).nullable(),
  questStatus: z.enum(QUEST_STATUSES).nullable(),
  subQuests: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      status: z.enum(QUEST_STATUSES),
    }),
  ),
});

/** Note dans une liste : sans le texte, avec un extrait (centré sur la recherche s'il y en a une). */
export const NoteSummary = z.object({ ...common, excerpt: z.string() });

export const NotePage = z.object({
  items: z.array(NoteSummary),
  /** Curseur de la page suivante, null en fin de liste. */
  nextCursor: z.string().nullable(),
  /** Nombre de notes correspondant aux filtres (première page seulement, sinon null). */
  total: z.number().int().nullable(),
});

export const NoteFacets = z.object({
  total: z.number().int(),
  pinned: z.number().int(),
  types: z.record(z.enum(NOTE_TYPES), z.number().int()),
  /** Par campagne. */
  campaigns: z.array(z.object({ campaignId: z.string(), count: z.number().int() })),
  /** Étiquettes les plus utilisées d'abord. */
  tags: z.array(z.object({ label: z.string(), count: z.number().int() })),
});

/** Filtres et pagination des listes. */
export const ListQuery = z.object({
  /** Une campagne (liste de toutes mes notes seulement). */
  campaignId: CampaignId.optional(),
  type: z.enum(NOTE_TYPES).optional(),
  pinned: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  /** Recherche plein texte : titre, étiquettes, détails et texte, sans accents, par préfixe. */
  q: z.string().trim().max(LIMITS.query).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.pageMax).default(LIMITS.pageDefault),
  cursor: z.string().max(200).optional(),
});
export type ListQuery = z.infer<typeof ListQuery>;
