/** Clés d'API personnelles (service identity). */
import { api } from './api';

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** La clé complète n'est renvoyée qu'une fois, à la création : ne jamais la stocker. */
export interface CreatedApiKey {
  id: string;
  name: string;
  prefix: string;
  key: string;
}

export function getApiKeys() {
  return api<ApiKey[]>('/v1/api-keys');
}

export function createApiKey(name: string) {
  return api<CreatedApiKey>('/v1/api-keys', { method: 'POST', body: JSON.stringify({ name }) });
}

export function revokeApiKey(id: string) {
  return api<void>(`/v1/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
