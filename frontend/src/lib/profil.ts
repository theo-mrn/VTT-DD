/**
 * Profils, titres et envoi d'images (service identity).
 * Les composants passent par ces fonctions typées, jamais par fetch directement.
 */
import { api, ApiError } from './api';

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
export const TAILLE_MAX_IMAGE = 5 * 1024 * 1024;

interface UrlEnvoi {
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;
}

/** Vérifie le fichier avant envoi ; renvoie un message d'erreur ou null. */
export function verifierImage(fichier: File): string | null {
  if (!(TYPES_IMAGE as readonly string[]).includes(fichier.type))
    return 'Format non pris en charge : PNG, JPEG, WebP ou GIF uniquement.';
  if (fichier.size > TAILLE_MAX_IMAGE) return 'Image trop lourde : 5 Mo maximum.';
  return null;
}

/**
 * Envoie une image en trois temps : URL présignée, dépôt direct du fichier
 * sur le stockage (sans jeton), puis enregistrement de l'URL publique.
 */
export async function envoyerImage(type: TypeImage, fichier: File): Promise<Profil> {
  const { uploadUrl, publicUrl } = await api<UrlEnvoi>('/v1/users/me/uploads', {
    method: 'POST',
    body: JSON.stringify({ kind: type, contentType: fichier.type, size: fichier.size }),
  });
  let depot: Response;
  try {
    depot = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': fichier.type },
      body: fichier,
    });
  } catch {
    throw new ApiError({ status: 0, title: "L'envoi du fichier vers le stockage a échoué." });
  }
  if (!depot.ok)
    throw new ApiError({
      status: depot.status,
      title: `Le stockage a refusé le fichier (${depot.status}).`,
    });
  return modifierMonProfil(type === 'avatar' ? { avatarUrl: publicUrl } : { bannerUrl: publicUrl });
}

// ─── Titres ──────────────────────────────────────────────────────────────────

export interface Titre {
  slug: string;
  label: string;
  description: string;
  condition: string;
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
