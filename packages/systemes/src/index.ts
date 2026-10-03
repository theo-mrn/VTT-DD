/**
 * Systèmes de référence assemblés au build (`dist/systemes/<id>.json`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { charger, type SystemeCharge } from '@vtt/rules';

/** Document brut d'un système de référence (à stocker ou à envoyer au front). */
export function documentSysteme(id: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./systemes/${id}.json`, import.meta.url), 'utf8'),
  ) as unknown;
}

/** Système de référence chargé et prêt à calculer. */
export function systeme(id: string): SystemeCharge {
  const r = charger(documentSysteme(id));
  if (!r.ok)
    throw new Error(`Système ${id} invalide : ${r.erreurs[0]?.chemin} ${r.erreurs[0]?.message}`);
  return r.systeme;
}

/** Présentation validée d'un système de référence (skins, couleurs, fiche), si elle existe. */
export function documentPresentation(id: string): unknown {
  const url = new URL(`./systemes/${id}.presentation.json`, import.meta.url);
  return existsSync(url) ? (JSON.parse(readFileSync(url, 'utf8')) as unknown) : undefined;
}
