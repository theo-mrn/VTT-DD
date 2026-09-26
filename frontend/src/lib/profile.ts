/**
 * Profils, titres et envoi d'images (service identity).
 * Les composants passent par ces fonctions typées, jamais par fetch directement.
 */
import { api, ApiError } from './api';

export type Provider = 'google' | 'discord';

/** GET /v1/users/me */
export interface Profile {
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
  settings: Record<string, unknown>;
  hasPassword: boolean;
  providers: Provider[];
  createdAt: string;
}

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'name'
    | 'bio'
    | 'avatarUrl'
    | 'bannerUrl'
    | 'borderType'
    | 'showPremiumBadge'
    | 'emailNotifications'
    | 'settings'
  >
>;

/** GET /v1/users/:id */
export interface PublicProfile {
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
}

/** GET /v1/users?search= */
export interface FoundPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
}

export function getMyProfile() {
  return api<Profile>('/v1/users/me');
}

export function updateMyProfile(update: ProfileUpdate) {
  return api<Profile>('/v1/users/me', { method: 'PATCH', body: JSON.stringify(update) });
}

export function getPlayer(id: string) {
  return api<PublicProfile>(`/v1/users/${encodeURIComponent(id)}`);
}

/** Recherche de joueurs par nom (2 caractères minimum, sinon liste vide sans appel). */
export function searchPlayers(text: string, limit = 10) {
  const t = text.trim();
  if (t.length < 2) return Promise.resolve([] as FoundPlayer[]);
  const params = new URLSearchParams({ search: t, limit: String(limit) });
  return api<FoundPlayer[]>(`/v1/users?${params}`);
}

// ─── Images (avatar, bannière) ───────────────────────────────────────────────

export type ImageKind = 'avatar' | 'banner';
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

interface UploadUrl {
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;
}

/** Vérifie le fichier avant envoi ; renvoie un message d'erreur ou null. */
export function checkImage(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type))
    return 'Format non pris en charge : PNG, JPEG, WebP ou GIF uniquement.';
  if (file.size > MAX_IMAGE_SIZE) return 'Image trop lourde : 5 Mo maximum.';
  return null;
}

/**
 * Envoie une image en trois temps : URL présignée, dépôt direct du fichier
 * sur le stockage (sans jeton), puis enregistrement de l'URL publique.
 */
export async function uploadImage(type: ImageKind, file: File): Promise<Profile> {
  const { uploadUrl, publicUrl } = await api<UploadUrl>('/v1/users/me/uploads', {
    method: 'POST',
    body: JSON.stringify({ kind: type, contentType: file.type, size: file.size }),
  });
  let upload: Response;
  try {
    upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': file.type },
      body: file,
    });
  } catch {
    throw new ApiError({ status: 0, title: "L'envoi du fichier vers le stockage a échoué." });
  }
  if (!upload.ok)
    throw new ApiError({
      status: upload.status,
      title: `Le stockage a refusé le fichier (${upload.status}).`,
    });
  return updateMyProfile(type === 'avatar' ? { avatarUrl: publicUrl } : { bannerUrl: publicUrl });
}

// ─── Titres ──────────────────────────────────────────────────────────────────

/** Condition de déblocage d'un titre (GET /v1/titles). */
export type TitleCondition =
  | { type: 'time'; minutes: number }
  | { type: 'event'; description: string }
  | { type: 'premium' }
  | { type: string; [key: string]: unknown };

/** Phrase lisible pour une condition de déblocage. */
export function conditionText(c: TitleCondition | null, description?: string | null): string {
  if (!c) return description ?? 'Attribué par un maître du jeu';
  if (c.type === 'time' && typeof c.minutes === 'number') {
    const m = c.minutes;
    return `Jouer ${m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`}`;
  }
  if (c.type === 'event' && typeof c.description === 'string') return c.description;
  if (c.type === 'premium') return 'Réservé aux membres premium';
  return description ?? 'Condition particulière';
}

export interface Title {
  slug: string;
  label: string;
  description: string;
  condition: TitleCondition | null;
  defaultUnlocked: boolean;
}

export interface UnlockedTitle {
  slug: string;
  label: string;
  unlockedAt: string;
}

export function getTitles() {
  return api<Title[]>('/v1/titles');
}

export function getMyTitles() {
  return api<UnlockedTitle[]>('/v1/users/me/titles');
}

/** Choisit le titre affiché (null pour n'en afficher aucun). */
export function chooseTitle(slug: string | null) {
  return api<{ title: string | null }>('/v1/users/me/title', {
    method: 'PUT',
    body: JSON.stringify({ slug }),
  });
}
