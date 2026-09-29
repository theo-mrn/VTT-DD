/**
 * Module « maps » : la carte de la campagne (scènes, tokens, couches,
 * brouillard, réglages), en PostGIS. Contrat : docs/api-map.md ; modèle :
 * docs/map.md.
 */
import type { Module } from '../../deps.js';
import { registerArrange } from './arrange.js';
import { registerLayers } from './layers.js';
import { registerMaps } from './maps.js';
import { registerTokens } from './tokens.js';

export const register: Module = async (app, deps) => {
  await registerMaps(app, deps);
  await registerTokens(app, deps);
  await registerLayers(app, deps);
  await registerArrange(app, deps);
};
