/**
 * Stockage d'une campagne (docs/stockage.md) : ce qu'elle occupe sur R2, la limite par campagne,
 * la réservation d'un envoi et l'écran « Stockage » du MJ.
 */
import { z } from 'zod';

/** Limite par défaut d'une campagne : 5 Gio (`CAMPAIGN_STORAGE_QUOTA_BYTES`). */
export const DEFAULT_CAMPAIGN_STORAGE_QUOTA = 5 * 1024 ** 3;
/** Part de la limite à partir de laquelle l'écran avertit. */
export const STORAGE_WARNING_RATIO = 0.8;

export const STORAGE_ERRORS = {
  quotaExceeded: 'storage_quota_exceeded',
  fileInUse: 'file_in_use',
  notDeletable: 'file_not_deletable',
} as const;

export const STORAGE_CATEGORIES = [
  'maps',
  'objects',
  'npcs',
  'characters',
  'notes',
  'sounds',
  'campaign',
  'other',
] as const;
export const StorageCategory = z.enum(STORAGE_CATEGORIES);
export type StorageCategory = z.infer<typeof StorageCategory>;

export const STORAGE_CATEGORY_LABELS: Record<StorageCategory, string> = {
  maps: 'Fonds de carte',
  objects: 'Objets',
  npcs: 'PNJ',
  characters: 'Personnages',
  notes: 'Notes',
  sounds: 'Sons',
  campaign: 'Campagne',
  other: 'Autres',
};

export const StorageFile = z.object({
  key: z.string(),
  /** Adresse publique (vignette, écoute). */
  url: z.string(),
  size: z.number().int().nonnegative(),
  contentType: z.string().nullable(),
  category: StorageCategory,
  /** Où il sert : libellés courts (« Fond de scène », « Note »…) ; vide : inutilisé. */
  usedBy: z.array(z.string()),
  /** Envoi réservé, pas encore vu sur le stockage. */
  pending: z.boolean(),
  /** Supprimable depuis l'écran (inutilisé, envoi de plus d'une heure, hors sons). */
  deletable: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type StorageFile = z.infer<typeof StorageFile>;

export const CampaignStorage = z.object({
  campaignId: z.uuid(),
  quotaBytes: z.number().int().positive(),
  usedBytes: z.number().int().nonnegative(),
  byCategory: z.array(
    z.object({ category: StorageCategory, bytes: z.number().int(), count: z.number().int() }),
  ),
  files: z.array(StorageFile),
  /** Dernier inventaire du stockage ; null : jamais fait. */
  inventoriedAt: z.iso.datetime().nullable(),
});
export type CampaignStorage = z.infer<typeof CampaignStorage>;

/**
 * `POST /internal/storage/reserve` (character, audio → campaign). character donne le personnage
 * quand il ne connaît pas sa campagne : campaign la retrouve (hors campagne : rien n'est compté).
 */
export const ReserveStorage = z
  .strictObject({
    campaignId: z.uuid().optional(),
    characterId: z.uuid().optional(),
    key: z.string().min(1).max(512),
    size: z.number().int().min(1),
    /** Usage de l'envoi (`portrait`, `map-background`…) ou `sound`. */
    usage: z.string().min(1).max(50),
    contentType: z.string().max(100).nullable(),
  })
  .refine((r) => r.campaignId || r.characterId, 'campagne ou personnage attendu');
export type ReserveStorage = z.infer<typeof ReserveStorage>;

/** Taille lisible : « 1,2 Go », « 340 Mo », « 12 ko » (base 1024, comme la limite). */
export function formatBytes(bytes: number): string {
  const units = ['o', 'ko', 'Mo', 'Go', 'To'];
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: digits })} ${units[i]}`;
}
