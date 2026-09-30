/**
 * Studio du portrait d'un personnage (docs/portraits.md) : à partir d'une image d'origine, un
 * portrait (3:4) et un token (carré : cadre, arrondi, marge) sont fabriqués dans le navigateur,
 * envoyés sur le stockage, puis enregistrés (`avatarUrl`, `tokenUrl`). Les réglages sont gardés
 * pour rouvrir le Studio et reprendre là où on en était.
 */
import { z } from 'zod';

/** Zone gardée de l'image d'origine, en fractions de sa largeur et de sa hauteur (0 à 1). */
export const StudioCrop = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
});
export type StudioCrop = z.infer<typeof StudioCrop>;

export const PortraitStudio = z.strictObject({
  /** Image d'origine (stockage, bibliothèque ou adresse web). */
  source: z.string().max(2048).nullable(),
  /** Cadrage du portrait (3:4) et du token (carré). */
  portrait: StudioCrop.nullable(),
  token: StudioCrop.nullable(),
  /** Cadre du token (image de la bibliothèque) ; null : aucun. */
  frame: z.string().max(2048).nullable(),
  /** Arrondi du token, en % du côté : 0 carré, 50 cercle. */
  radius: z.number().min(0).max(50),
  /** Marge de l'image dans le cadre, en % du côté. */
  inset: z.number().min(0).max(40),
});
export type PortraitStudio = z.infer<typeof PortraitStudio>;

/** Réglages par défaut d'un nouveau Studio : token rond, sans cadre. */
export const DEFAULT_PORTRAIT_STUDIO: PortraitStudio = {
  source: null,
  portrait: null,
  token: null,
  frame: null,
  radius: 50,
  inset: 0,
};
