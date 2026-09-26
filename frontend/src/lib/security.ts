/**
 * Sécurité du compte (service identity) : sessions, mot de passe, e-mail,
 * suppression du compte et connexion OAuth.
 */
import { api, CSRF_HEADER, setAccessToken } from './api';
import type { Provider } from './profile';

export interface ActiveSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}

export function getSessions() {
  return api<ActiveSession[]>('/v1/auth/sessions');
}

export function revokeSession(id: string) {
  return api<void>(`/v1/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Déconnecte tous les appareils, y compris celui-ci. */
export async function logoutEverywhere() {
  try {
    await api<void>('/v1/auth/logout-all', { method: 'POST', headers: CSRF_HEADER });
  } finally {
    setAccessToken(null);
  }
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api<void>('/v1/auth/password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/** Toujours 202, que le compte existe ou non. */
export function requestPasswordReset(email: string) {
  return api<void>('/v1/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/** Réinitialise le mot de passe : toutes les sessions sont révoquées. */
export async function resetPassword(token: string, newPassword: string) {
  await api<void>('/v1/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  setAccessToken(null);
}

export function sendVerificationEmail() {
  return api<void>('/v1/auth/email/verification', { method: 'POST' });
}

export function verifyEmail(token: string) {
  return api<void>('/v1/auth/email/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

/** Supprime définitivement le compte (mot de passe exigé s'il en a un). */
export async function deleteAccount(password?: string) {
  await api<void>('/v1/users/me', {
    method: 'DELETE',
    body: JSON.stringify(password ? { password } : {}),
  });
  setAccessToken(null);
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// ─── OAuth ───────────────────────────────────────────────────────────────────

export type OAuthProviders = Record<Provider, boolean>;

export function getOAuthProviders() {
  return api<OAuthProviders>('/v1/auth/oauth/providers');
}

/** Adresse de départ OAuth : le backend redirige vers `redirection` avec la session ouverte. */
export function oauthUrl(provider: Provider, redirection: string) {
  return `/v1/auth/oauth/${provider}/start?${new URLSearchParams({ redirect: redirection })}`;
}
