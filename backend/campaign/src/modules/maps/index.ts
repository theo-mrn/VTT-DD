/**
 * Module « maps » : la carte de la campagne (scènes, tokens, couches,
 * brouillard, réglages), en PostGIS. Contrat : docs/api-map.md ; modèle :
 * docs/map.md.
 */
import type { Module } from '../../deps.js';
import { registerArrange } from './arrange.js';
import { registerLayers } from './layers.js';
import { registerNpcs } from './npcs.js';
import { registerObjectSearch } from './objects.js';
import { registerMaps } from './maps.js';
import { registerPortalUse } from './portals.js';
import { registerTokens } from './tokens.js';

export const register: Module = async (app, deps) => {
  await registerMaps(app, deps);
  await registerTokens(app, deps);
  await registerLayers(app, deps);
  await registerArrange(app, deps);
  await registerNpcs(app, deps);
  await registerObjectSearch(app, deps);
  await registerPortalUse(app, deps);
};
