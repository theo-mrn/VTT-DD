/**
 * Bibliothèque partagée (docs/bibliotheque.md) : fonds de scène communs à toutes les campagnes,
 * décrits à l'import et retrouvés par ce qu'ils montrent (« grotte illuminée », « intérieur de
 * château »). Une entrée est un lieu ; ses variantes sont les images de ce lieu.
 */
import { z } from 'zod';

/**
 * Usage d'un fond : le plan de carte, vu du dessus, où l'on pose les jetons ; l'illustration,
 * un décor vu de face, pour l'ambiance.
 */
export const BACKGROUND_KINDS = ['map', 'illustration'] as const;
export const BackgroundKind = z.enum(BACKGROUND_KINDS);
export type BackgroundKind = z.infer<typeof BackgroundKind>;

/** Lieux reconnus (clés anglaises, traduites par le front). */
export const BACKGROUND_PLACES = [
  'forest',
  'mountain',
  'cave',
  'castle',
  'dungeon',
  'ruins',
  'village',
  'city',
  'tavern',
  'temple',
  'graveyard',
  'swamp',
  'lake',
  'sea',
  'desert',
  'plains',
  'camp',
  'farm',
  'other',
] as const;
export const BackgroundPlace = z.enum(BACKGROUND_PLACES);
export type BackgroundPlace = z.infer<typeof BackgroundPlace>;

export const BACKGROUND_SETTINGS = ['indoor', 'outdoor', 'underground'] as const;
export const BackgroundSetting = z.enum(BACKGROUND_SETTINGS);
export type BackgroundSetting = z.infer<typeof BackgroundSetting>;

export const BACKGROUND_TIMES = ['day', 'dusk', 'night', 'unknown'] as const;
export const BackgroundTime = z.enum(BACKGROUND_TIMES);
export type BackgroundTime = z.infer<typeof BackgroundTime>;

export const BACKGROUND_MOODS = [
  'peaceful',
  'mysterious',
  'eerie',
  'magical',
  'epic',
  'grim',
  'cozy',
  'desolate',
] as const;
export const BackgroundMood = z.enum(BACKGROUND_MOODS);
export type BackgroundMood = z.infer<typeof BackgroundMood>;

/** Langue des textes servis (titre, description, mots-clés). */
export const LibraryLang = z.enum(['fr', 'en']);
export type LibraryLang = z.infer<typeof LibraryLang>;

export const BackgroundVariant = z.object({
  id: z.string(),
  /** 0 : la variante montrée par défaut. */
  position: z.number().int(),
  url: z.string(),
  thumbUrl: z.string().nullable(),
  /** Aperçu animé (fond vidéo). */
  previewUrl: z.string().nullable(),
  kind: z.enum(['image', 'video']),
  /** Grille dessinée dans l'image. */
  grid: z.boolean(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type BackgroundVariant = z.infer<typeof BackgroundVariant>;

export const Background = z.object({
  id: z.string(),
  kind: BackgroundKind,
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
  collection: z.string().nullable(),
  place: BackgroundPlace.nullable(),
  setting: BackgroundSetting.nullable(),
  timeOfDay: BackgroundTime.nullable(),
  moods: z.array(BackgroundMood),
  animated: z.boolean(),
  variants: z.array(BackgroundVariant),
});
export type Background = z.infer<typeof Background>;

export const BACKGROUNDS_PER_PAGE = 30;

export const BackgroundQuery = z.object({
  q: z.string().trim().max(120).optional(),
  lang: LibraryLang.default('fr'),
  kind: BackgroundKind.optional(),
  place: BackgroundPlace.optional(),
  setting: BackgroundSetting.optional(),
  time: BackgroundTime.optional(),
  mood: BackgroundMood.optional(),
  collection: z.string().trim().min(1).max(100).optional(),
  animated: z
    .enum(['0', '1'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === '1')),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type BackgroundQuery = z.infer<typeof BackgroundQuery>;

export const BackgroundPage = z.object({
  items: z.array(Background),
  page: z.number().int(),
  perPage: z.number().int(),
  total: z.number().int(),
});
export type BackgroundPage = z.infer<typeof BackgroundPage>;

/** Facettes d'un usage (plans ou illustrations), ou de tout le catalogue sans `kind`. */
export const BackgroundFacetsQuery = z.object({ kind: BackgroundKind.optional() });
export type BackgroundFacetsQuery = z.infer<typeof BackgroundFacetsQuery>;

/**
 * Nombre d'entrées par valeur de facette (menus des filtres), pour l'usage demandé ; `kinds`
 * compte toujours tout le catalogue (onglets plans et illustrations).
 */
export const BackgroundFacets = z.object({
  kinds: z.record(z.string(), z.number().int()),
  collections: z.record(z.string(), z.number().int()),
  /** Vignette de couverture de chaque collection (son premier fond fixe). */
  covers: z.record(z.string(), z.string()),
  places: z.record(z.string(), z.number().int()),
  settings: z.record(z.string(), z.number().int()),
  times: z.record(z.string(), z.number().int()),
  moods: z.record(z.string(), z.number().int()),
  animated: z.number().int(),
  total: z.number().int(),
});
export type BackgroundFacets = z.infer<typeof BackgroundFacets>;

/** Fond d'une scène retrouvé par l'adresse d'une de ses variantes. */
export const BackgroundLookup = z.object({
  url: z.string().url().max(1000),
  lang: LibraryLang.default('fr'),
});
export type BackgroundLookup = z.infer<typeof BackgroundLookup>;
