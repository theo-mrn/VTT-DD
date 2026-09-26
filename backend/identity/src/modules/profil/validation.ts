/**
 * Règles de validation du profil, sans accès à la base : schémas Zod des
 * entrées et contrôle des URL d'images envoyées par le client.
 */
import { z } from 'zod';

/** Bordures de la carte de profil, reprises telles quelles de l'ancienne app. */
export const BORDER_TYPES = [
  'none',
  'blue',
  'orange',
  'magic',
  'magic_purple',
  'magic_green',
  'magic_red',
  'magic_double',
  'magic_shine',
  'magic_shine_aurora',
  'magic_shine_solar',
  'magic_shine_twilight',
] as const;

/** Taille maximale des préférences (JSON sérialisé, en octets). */
export const SETTINGS_MAX_OCTETS = 16 * 1024;

/** Taille maximale d'une image envoyée (5 Mo). */
export const IMAGE_MAX_OCTETS = 5 * 1024 * 1024;

export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type TypeImage = (typeof TYPES_IMAGE)[number];

export const Settings = z
  .record(z.string(), z.unknown())
  .refine((v) => Buffer.byteLength(JSON.stringify(v), 'utf8') <= SETTINGS_MAX_OCTETS, {
    message: `Préférences trop volumineuses (${SETTINGS_MAX_OCTETS} octets au plus)`,
  });

/** URL d'image : vérifiée ensuite contre le stockage de l'utilisateur. */
const UrlImage = z.string().max(2048).nullable();

export const PatchProfil = z
  .object({
    name: z.string().trim().min(1, 'Nom requis').max(64),
    // Une bio vide revient à l'effacer
    bio: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .transform((v) => (v ? v : null)),
    avatarUrl: UrlImage,
    bannerUrl: UrlImage,
    borderType: z.enum(BORDER_TYPES),
    showPremiumBadge: z.boolean(),
    emailNotifications: z.boolean(),
    settings: Settings,
  })
  .partial()
  .strict();
export type PatchProfil = z.infer<typeof PatchProfil>;

export const DemandeEnvoi = z.object({
  kind: z.enum(['avatar', 'banner']),
  contentType: z.enum(TYPES_IMAGE),
  size: z.number().int().min(1).max(IMAGE_MAX_OCTETS),
});
export type DemandeEnvoi = z.infer<typeof DemandeEnvoi>;

export const RechercheUtilisateurs = z.object({
  search: z.string().trim().min(2).max(64),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export const AjoutTemps = z.object({ minutes: z.number().int().min(1).max(60) });

/** Dossier du stockage propre à chaque type d'image. */
export const DOSSIERS = { avatar: 'avatars', banner: 'banners' } as const;

/** URL publique du stockage sans barre finale, ou null si non configurée. */
export function basePublique(s3PublicUrl: string | undefined): string | null {
  return s3PublicUrl ? s3PublicUrl.replace(/\/+$/, '') : null;
}

/**
 * Une URL d'image est acceptée si elle vaut null, la valeur déjà enregistrée,
 * ou un fichier du dossier de l'utilisateur sur notre stockage
 * ({S3_PUBLIC_URL}/avatars/<userId>/<fichier>). Jamais une URL arbitraire :
 * elle serait affichée aux autres joueurs (pistage, contenu tiers).
 */
export function urlImageAcceptee(
  url: string | null,
  actuelle: string | null,
  base: string | null,
  dossier: 'avatars' | 'banners',
  userId: string,
): boolean {
  if (url === null || url === actuelle) return true;
  if (!base) return false;
  const prefixe = `${base}/${dossier}/${userId}/`;
  if (!url.startsWith(prefixe)) return false;
  // Un seul nom de fichier simple : ni sous-dossier, ni « .. », ni requête
  const fichier = url.slice(prefixe.length);
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/.test(fichier);
}

/** Échappe les jokers de LIKE (%, _ et le caractère d'échappement \). */
export function echapperLike(texte: string): string {
  return texte.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Égalité de deux valeurs JSON, indépendante de l'ordre des clés. */
export function jsonEgal(a: unknown, b: unknown): boolean {
  return canonique(a) === canonique(b);
}

function canonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (v && typeof v === 'object') {
    const cles = Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort();
    return `{${cles.map((k) => `${JSON.stringify(k)}:${canonique((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}
