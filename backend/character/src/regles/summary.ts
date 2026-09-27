/**
 * Résumé d'un personnage pour les listes (cartes, table d'une campagne) :
 * entrées uniques (« Elfe · Magicien ») et valeurs clés (« Niveau 3 »,
 * « PV 12/14 »). Tout est lu dans le système et sa présentation : aucune clé
 * de jeu ici. Même règle que l'aperçu du front pendant la création.
 *
 * Le calcul demande la fiche : il est gardé en mémoire par personnage et par
 * version (une écriture incrémente la version, le résumé en cache reste juste).
 */
import { Presentation, type Fiche, type ValeurCalculee } from '@vtt/rules';
import { z } from 'zod';
import type { Catalogue } from './catalogue.js';

/** Schéma de réponse du résumé (listes, résumé interne). */
export const CharacterSummary = z.object({
  /** Entrées uniques (race, profil, carrière…), séparées par « · ». */
  tagline: z.string(),
  /** Trois valeurs clés au plus : celles du bloc « details » de la fiche, puis les ressources. */
  highlights: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type CharacterSummary = z.output<typeof CharacterSummary>;

const HIGHLIGHTS_MAX = 3;

/** Valeur calculée affichable (« 14 », « oui », texte). */
function display(v: ValeurCalculee | undefined): string {
  if (!v) return '—';
  if (typeof v.valeur === 'boolean') return v.valeur ? 'oui' : 'non';
  if (typeof v.valeur === 'number')
    return Number.isInteger(v.valeur) ? String(v.valeur) : v.valeur.toFixed(1);
  return v.valeur || '—';
}

/** Résumé d'une fiche calculée, selon la présentation de son système (facultative). */
export function summarize(fiche: Fiche, presentation: Presentation | null): CharacterSummary {
  const details = presentation?.fiches[fiche.etat.type]?.widgets.find((w) => w.type === 'details');
  const kinds =
    details?.type === 'details'
      ? details.sortes
      : [...fiche.systeme.sortes.values()]
          .filter((s) => s.maximum === 1 && s.pour.includes(fiche.etat.type))
          .map((s) => s.id);
  const names: string[] = [];
  for (const kind of kinds)
    for (const p of fiche.possessions.values()) if (p.sorte.id === kind) names.push(p.entree.nom);

  const highlights: CharacterSummary['highlights'] = [];
  if (details?.type === 'details') {
    for (const key of details.attributs) {
      const a = fiche.entite.attributs.get(key);
      const v = fiche.valeurs.get(key);
      if (a && v && a.nature !== 'texte') highlights.push({ label: a.nom, value: display(v) });
    }
  }
  for (const a of fiche.entite.attributs.values()) {
    if (a.nature !== 'ressource' || a.visibilite === 'mj' || highlights.length >= HIGHLIGHTS_MAX)
      continue;
    const v = fiche.valeurs.get(a.cle);
    if (v) highlights.push({ label: a.abrege ?? a.nom, value: `${display(v)}/${v.max ?? '—'}` });
  }
  return { tagline: names.join(' · '), highlights };
}

const presentations = new WeakMap<object, Presentation | null>();

/** Présentation validée d'un système (null s'il n'en a pas, ou si elle est invalide). */
export function presentationOf(catalogue: Catalogue, systemId: string): Presentation | null {
  const documents = catalogue.documents(systemId);
  if (!documents) return null;
  if (!presentations.has(documents)) {
    const r = documents.presentation ? Presentation.safeParse(documents.presentation) : null;
    presentations.set(documents, r?.success ? r.data : null);
  }
  return presentations.get(documents) ?? null;
}

/** Résumés gardés en mémoire, par `id:version` (les plus anciens sortent d'abord). */
const CACHE_MAX = 5_000;
const cache = new Map<string, CharacterSummary>();

/**
 * Résumé d'un personnage enregistré ; `fiche` n'est calculée (paresseusement)
 * que si le résumé de cette version n'est pas en cache.
 */
export function summaryOf(
  catalogue: Catalogue,
  character: { id: string; version: number; systemId: string },
  fiche: () => Fiche,
): CharacterSummary {
  const key = `${character.id}:${character.version}`;
  const known = cache.get(key);
  if (known) return known;
  const summary = summarize(fiche(), presentationOf(catalogue, character.systemId));
  cache.set(key, summary);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return summary;
}
