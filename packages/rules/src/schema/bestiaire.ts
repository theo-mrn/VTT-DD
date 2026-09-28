/**
 * Bestiaire de référence d'un système : des créatures du livre, à consulter (onglet
 * Bestiaire des ressources, docs/ressources.md). Document séparé des règles, validé contre
 * le système chargé par `checkBestiary()`.
 *
 * Une créature est une **fiche de lecture**, pas un état calculable : `valeurs` donne les
 * statistiques telles que le livre les imprime (Défense, attaques…), par clé d'attribut du
 * type d'entité, sans passer par les formules du système.
 */
import { z } from 'zod';
import type { SystemeCharge } from '../chargement/index.js';
import { Cle, Id } from './systeme.js';

const Libelle = z.string().min(1).max(200);

export const BestiaryAction = z.object({
  nom: Libelle,
  description: z.string().max(10_000).default(''),
  /** Bonus d'attaque imprimé (« +9 pour toucher »), s'il y en a un. */
  toucher: z.number().optional(),
});
export type BestiaryAction = z.output<typeof BestiaryAction>;

export const BestiaryCreature = z.object({
  id: Id,
  nom: Libelle,
  /** Type d'entité dont les attributs nomment les valeurs. */
  entite: Id,
  /** Famille de créatures (filtre du bestiaire). */
  categorie: Libelle,
  /** Précision imprimée sous le nom (« Bête (grande) »). */
  type: z.string().max(200).optional(),
  description: z.string().max(20_000).optional(),
  image: z.string().min(1).max(2000).optional(),
  valeurs: z.record(Cle, z.union([z.number(), z.string(), z.boolean()])).default({}),
  actions: z.array(BestiaryAction).default([]),
});
export type BestiaryCreature = z.output<typeof BestiaryCreature>;

export const Bestiary = z.object({
  format: z.literal(1),
  systeme: Id,
  creatures: z.array(BestiaryCreature),
});
export type Bestiary = z.output<typeof Bestiary>;

export interface BestiaryError {
  chemin: string;
  message: string;
}

/** Vérifie la forme, puis chaque créature : identifiant unique, type d'entité et attributs connus. */
export function checkBestiary(
  input: unknown,
  systeme: SystemeCharge,
): { ok: true; bestiary: Bestiary } | { ok: false; erreurs: BestiaryError[] } {
  const forme = Bestiary.safeParse(input);
  if (!forme.success)
    return {
      ok: false,
      erreurs: forme.error.issues.map((i) => ({
        chemin: i.path.map(String).join('/'),
        message: i.message,
      })),
    };
  const b = forme.data;
  const erreurs: BestiaryError[] = [];
  if (b.systeme !== systeme.source.id)
    erreurs.push({
      chemin: 'systeme',
      message: `Bestiaire de ${b.systeme}, système ${systeme.source.id}`,
    });
  const vus = new Set<string>();
  b.creatures.forEach((c, i) => {
    const chemin = `creatures/${i}`;
    if (vus.has(c.id)) erreurs.push({ chemin, message: `Créature en double : ${c.id}` });
    vus.add(c.id);
    const e = systeme.entites.get(c.entite);
    if (!e) {
      erreurs.push({ chemin, message: `Type d’entité inconnu : ${c.entite}` });
      return;
    }
    for (const cle of Object.keys(c.valeurs))
      if (!e.attributs.has(cle))
        erreurs.push({
          chemin: `${chemin}/valeurs`,
          message: `Attribut inconnu de ${c.entite} : ${cle}`,
        });
  });
  return erreurs.length ? { ok: false, erreurs } : { ok: true, bestiary: b };
}
