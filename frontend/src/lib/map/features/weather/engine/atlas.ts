/**
 * Disposition de l'atlas des particules de la météo : une seule texture pour toutes les
 * particules (un `ParticleContainer` n'accepte qu'une source). Dessiné par `textures.ts`, lu
 * par la simulation pour l'échelle des particules. Marge de 4 px entre les images (filtrage).
 */
import type { AtlasFrame } from './effects';

export interface AtlasRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Taille visible de référence (px) : échelle = taille voulue / `nominal`. */
  nominal: number;
  /** Traînée : longueur visible de référence (px). */
  nominalLength?: number;
}

export const ATLAS_WIDTH = 236;
export const ATLAS_HEIGHT = 64;

export const ATLAS: Readonly<Record<AtlasFrame, AtlasRect>> = {
  // Traînée verticale, tête en bas : 3 px visibles sur 8, 64 de long
  streak: { x: 0, y: 0, w: 8, h: 64, nominal: 3, nominalLength: 64 },
  // Point doux : disque d'environ 20 px dans 32
  dot: { x: 12, y: 0, w: 32, h: 32, nominal: 20 },
  // Flocon : cœur plein et halo
  flake: { x: 48, y: 0, w: 32, h: 32, nominal: 22 },
  // Feuilles : longueur 32, hauteur 20
  leaf0: { x: 84, y: 0, w: 32, h: 20, nominal: 32 },
  leaf1: { x: 84, y: 24, w: 32, h: 20, nominal: 32 },
  leaf2: { x: 120, y: 0, w: 32, h: 20, nominal: 32 },
  // Anneau d'éclaboussure : rayon visible ~ 26 px dans 64
  ring: { x: 168, y: 0, w: 64, h: 64, nominal: 52 },
};
