/**
 * Profils, titres et envoi d'images (service identity).
 * Les composants passent par ces fonctions typées, jamais par fetch directement.
 */
import { UPLOAD_USAGES, type Locale } from '@vtt/contracts';
import { dates } from '@/i18n/dates';
import { translate } from '@/i18n/runtime';
import { api } from './api';
import { uploadRefusal } from './uploads/check';
import { MAX_SIDE, prepareImage } from './uploads/image';
import { uploadFile, type UploadProgress } from './uploads/uploader';

export type Fournisseur = 'google' | 'discord';

/** GET /v1/users/me */
export interface Profil {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  bannerUrl: string | null;
  borderType: string;
  showPremiumBadge: boolean;
  timeSpentMinutes: number;
  emailNotifications: boolean;
  /** Langue choisie sur le compte ; null : le navigateur décide (docs/i18n.md § 3). */
  locale: Locale | null;
  settings: Record<string, unknown>;
  hasPassword: boolean;
  providers: Fournisseur[];
  createdAt: string;
}

export type ModificationProfil = Partial<
  Pick<
    Profil,
    | 'name'
    | 'bio'
    | 'avatarUrl'
    | 'bannerUrl'
    | 'borderType'
    | 'showPremiumBadge'
    | 'emailNotifications'
    | 'locale'
    | 'settings'
  >
>;

/** GET /v1/users/:id */
export interface ProfilPublic {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  bannerUrl: string | null;
  borderType: string;
  premium: boolean;
  showPremiumBadge: boolean;
  timeSpentMinutes: number;
  /** Niveau du compte (docs/progression.md). */
  level: number;
}

/** GET /v1/users?search= */
export interface JoueurTrouve {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
}

export function lireMonProfil() {
  return api<Profil>('/v1/users/me');
}

export function modifierMonProfil(modif: ModificationProfil) {
  return api<Profil>('/v1/users/me', { method: 'PATCH', body: JSON.stringify(modif) });
}

export function lireJoueur(id: string) {
  return api<ProfilPublic>(`/v1/users/${encodeURIComponent(id)}`);
}

/** Recherche de joueurs par nom (2 caractères minimum, sinon liste vide sans appel). */
export function rechercherJoueurs(texte: string, limite = 10) {
  const t = texte.trim();
  if (t.length < 2) return Promise.resolve([] as JoueurTrouve[]);
  const params = new URLSearchParams({ search: t, limit: String(limite) });
  return api<JoueurTrouve[]>(`/v1/users?${params}`);
}

// ─── Images (avatar, bannière) ───────────────────────────────────────────────

export type TypeImage = 'avatar' | 'banner';
export const TYPES_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const TAILLE_MAX_IMAGE = UPLOAD_USAGES.avatar.maxBytes;

/** Vérifie le fichier avant envoi ; renvoie un message d'erreur ou null. */
export function verifierImage(fichier: File): string | null {
  return uploadRefusal('avatar', fichier);
}

/**
 * Envoie une image (route commune d'envoi, docs/uploads.md) : compressée en WebP, déposée
 * directement sur le stockage, puis son adresse enregistrée sur le profil.
 */
export async function envoyerImage(
  type: TypeImage,
  fichier: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<Profil> {
  const pret = await prepareImage(fichier, { maxSide: MAX_SIDE[type] });
  const publicUrl = await uploadFile(
    { kind: 'user' },
    type,
    pret,
    onProgress ? { onProgress } : {},
  );
  return modifierMonProfil(type === 'avatar' ? { avatarUrl: publicUrl } : { bannerUrl: publicUrl });
}

// ─── Titres ──────────────────────────────────────────────────────────────────

/** Condition de déblocage d'un titre (GET /v1/titles). */
export type ConditionTitre =
  | { type: 'time'; minutes: number }
  | { type: 'event'; description: string }
  | { type: 'level'; level: number }
  | { type: 'premium' }
  | { type: string; [cle: string]: unknown };

/** Phrase lisible pour une condition de déblocage. */
export function texteCondition(c: ConditionTitre | null, description?: string | null): string {
  if (!c) return description ?? translate('account.titles.byGm');
  if (c.type === 'time' && typeof c.minutes === 'number')
    return translate('account.titles.play', { duration: dates().duration(c.minutes) });
  if (c.type === 'event' && typeof c.description === 'string') return c.description;
  if (c.type === 'level' && typeof c.level === 'number')
    return translate('account.titles.level', { level: String(c.level) });
  if (c.type === 'premium') return translate('account.titles.premium');
  return description ?? translate('account.titles.special');
}

export interface Titre {
  slug: string;
  label: string;
  description: string;
  condition: ConditionTitre | null;
  defaultUnlocked: boolean;
}

export interface TitreDebloque {
  slug: string;
  label: string;
  unlockedAt: string;
}

export function lireTitres() {
  return api<Titre[]>('/v1/titles');
}

export function lireMesTitres() {
  return api<TitreDebloque[]>('/v1/users/me/titles');
}

/** Choisit le titre affiché (null pour n'en afficher aucun). */
export function choisirTitre(slug: string | null) {
  return api<{ title: string | null }>('/v1/users/me/title', {
    method: 'PUT',
    body: JSON.stringify({ slug }),
  });
}
