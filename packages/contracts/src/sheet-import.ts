/**
 * Import d'une fiche de personnage (docs/import-fiche.md) : lecture brute d'une fiche, la même
 * qu'elle vienne d'un PDF (lu dans le navigateur) ou d'un lien (lu par le service character).
 * Aucune règle de jeu ici : des libellés, des valeurs, des noms. Le rapprochement avec le
 * système de la campagne se fait ensuite, depuis le système lui-même.
 */
import { z } from 'zod';

/** Paire libellé → valeur : champ de formulaire du PDF, ou champ nommé de la fiche en ligne. */
export const SheetField = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.string().max(10_000),
});
export type SheetField = z.output<typeof SheetField>;

/**
 * Élément nommé de la fiche : race, profil, voie, objet… `kind` dit ce que la fiche l'appelle
 * (« race », « voie », « arme ») et sert d'indice, rapproché des noms des sortes du système.
 */
export const SheetEntry = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.string().trim().max(60).optional(),
  /** Rang atteint (voie : dernier rang coché). */
  rank: z.number().int().min(0).max(100).optional(),
  quantity: z.number().int().positive().max(1_000_000).optional(),
  /** Noms de ses rangs, dans l'ordre (capacités d'une voie). */
  ranks: z.array(z.string().trim().max(200)).max(20).optional(),
  /** Précisions lues avec lui (« DM 1d6 »). */
  details: z.string().max(2000).optional(),
});
export type SheetEntry = z.output<typeof SheetEntry>;

/** Bloc de texte libre, sous son libellé (« Notes », « Historique ») s'il en a un. */
export const SheetText = z.object({
  label: z.string().trim().max(200).optional(),
  text: z.string().max(20_000),
});
export type SheetText = z.output<typeof SheetText>;

export const SheetSource = z.object({
  kind: z.enum(['pdf', 'link']),
  /** Site d'origine d'un lien (`nooblieeschroniques.fr`). */
  site: z.string().max(100).optional(),
  url: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .optional(),
});
export type SheetSource = z.output<typeof SheetSource>;

export const SheetReading = z.object({
  source: SheetSource,
  name: z.string().trim().max(200).optional(),
  /** Portrait de la fiche, à importer comme une image d'un autre site. */
  portraitUrl: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .optional(),
  fields: z.array(SheetField).max(2000),
  entries: z.array(SheetEntry).max(500),
  texts: z.array(SheetText).max(200),
});
export type SheetReading = z.output<typeof SheetReading>;

/** `POST /v1/characters/import/link` : adresse d'une fiche en ligne. */
export const SheetLinkRequest = z.strictObject({
  url: z.url({ protocol: /^https?$/ }).max(2048),
});
export type SheetLinkRequest = z.input<typeof SheetLinkRequest>;
