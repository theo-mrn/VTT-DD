/**
 * Sécurité du compte (service identity) : sessions, mot de passe, e-mail,
 * suppression du compte et connexion OAuth.
 */
import { api, ENTETE_CSRF, setAccessToken } from './api';
import type { Fournisseur } from './profil';

export interface SessionActive {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}

export function lireSessions() {
  return api<SessionActive[]>('/v1/auth/sessions');
}

export function revoquerSession(id: string) {
  return api<void>(`/v1/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Déconnecte tous les appareils, y compris celui-ci. */
export async function deconnecterPartout() {
  try {
    await api<void>('/v1/auth/logout-all', { method: 'POST', headers: ENTETE_CSRF });
  } finally {
    setAccessToken(null);
  }
}

export function changerMotDePasse(motDePasseActuel: string, nouveauMotDePasse: string) {
  return api<void>('/v1/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: motDePasseActuel, newPassword: nouveauMotDePasse }),
  });
}

/** Toujours 202, que le compte existe ou non. */
export function demanderReinitialisation(email: string) {
  return api<void>('/v1/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Réinitialise le mot de passe : toutes les sessions sont révoquées. */
export async function reinitialiserMotDePasse(jeton: string, nouveauMotDePasse: string) {
  await api<void>('/v1/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token: jeton, newPassword: nouveauMotDePasse }),
  });
  setAccessToken(null);
}

export function envoyerVerificationEmail() {
  return api<void>('/v1/auth/email/verification', { method: 'POST' });
}

export function verifierEmail(jeton: string) {
  return api<void>('/v1/auth/email/verify', {
    method: 'POST',
    body: JSON.stringify({ token: jeton }),
  });
}

/** Supprime définitivement le compte (mot de passe exigé s'il en a un). */
export async function supprimerCompte(motDePasse?: string) {
  await api<void>('/v1/users/me', {
    method: 'DELETE',
    body: JSON.stringify(motDePasse ? { password: motDePasse } : {}),
  });
  setAccessToken(null);
}

export const LONGUEUR_MIN_MDP = 8;
export const LONGUEUR_MAX_MDP = 128;

// ─── OAuth ───────────────────────────────────────────────────────────────────

export type FournisseursOAuth = Record<Fournisseur, boolean>;

export function lireFournisseursOAuth() {
  return api<FournisseursOAuth>('/v1/auth/oauth/providers');
}

/** Adresse de départ OAuth : le backend redirige vers `redirection` avec la session ouverte. */
export function urlOAuth(fournisseur: Fournisseur, redirection: string) {
  return `/v1/auth/oauth/${fournisseur}/start?${new URLSearchParams({ redirect: redirection })}`;
}
