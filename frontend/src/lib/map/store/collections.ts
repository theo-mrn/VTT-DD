/**
 * Couches de la carte côté front : clé du magasin (= clé du chargement initial `MapSnapshot`),
 * segment d'URL et domaine des événements. Déduit du registre du contrat (`MAP_LAYERS` de
 * `@vtt/contracts`), plus les tokens qui ont leurs propres routes.
 */
import { MAP_LAYERS } from '@vtt/contracts';

export interface CollectionDef {
  /** Clé du magasin et du chargement initial (`fogZones`). */
  key: string;
  /** Segment d'URL (`fog-zones`). */
  path: string;
  /** Domaine des événements (`map_fog_zone`). */
  domain: string;
}

export const MAP_COLLECTIONS: readonly CollectionDef[] = [
  { key: 'tokens', path: 'tokens', domain: 'token' },
  ...Object.entries(MAP_LAYERS).map(([path, def]) => ({ key: def.key, path, domain: def.domain })),
];

const BY_KEY = new Map(MAP_COLLECTIONS.map((c) => [c.key, c]));
const BY_DOMAIN = new Map(MAP_COLLECTIONS.map((c) => [c.domain, c]));

export const collectionByKey = (key: string) => BY_KEY.get(key);
export const collectionByDomain = (domain: string) => BY_DOMAIN.get(domain);

/** Couches dont les éléments sont rangés dans les calques du MJ (`layerId`). */
export const STACKED_COLLECTIONS = ['tokens', 'objects', 'drawings', 'notes'] as const;
