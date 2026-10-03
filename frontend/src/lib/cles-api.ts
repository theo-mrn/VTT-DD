/** Clés d'API personnelles (service identity). */
import { api } from './api';

export interface CleApi {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** La clé complète n'est renvoyée qu'une fois, à la création : ne jamais la stocker. */
export interface CleApiCreee {
  id: string;
  name: string;
  prefix: string;
  key: string;
}

export function lireClesApi() {
  return api<CleApi[]>('/v1/api-keys');
}

export function creerCleApi(nom: string) {
  return api<CleApiCreee>('/v1/api-keys', { method: 'POST', body: JSON.stringify({ name: nom }) });
}

export function revoquerCleApi(id: string) {
  return api<void>(`/v1/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
