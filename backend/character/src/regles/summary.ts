/**
 * Résumé d'un personnage pour les listes (cartes, table d'une campagne) :
 * entrées uniques (« Elfe · Magicien ») et valeurs clés (« Niveau 3 »,
 * « PV 12/14 »). Tout est lu dans le système et sa présentation : aucune clé
 * de jeu ici. Même règle que l'aperçu du front pendant la création.
 *
 * Le calcul demande la fiche : il est gardé en mémoire par personnage, par
 * version et par réglage des règles optionnelles (une écriture incrémente la
 * version, le résumé en cache reste juste).
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

type Widget = NonNullable<Presentation['fiches'][string]>['widgets'][number];
type DetailsWidget = Extract<Widget, { type: 'details' }>;

/** Bloc « details » de la fiche dans la présentation, s'il y en a un. */
function detailsWidget(fiche: Fiche, presentation: Presentation | null): DetailsWidget | undefined {
  const details = presentation?.fiches[fiche.etat.type]?.widgets.find((w) => w.type === 'details');
  return details?.type === 'details' ? details : undefined;
}

/** Un objet caché aux autres joueurs n'apparaît pas dans le résumé (listes de la table). */
const hiddenFromOthers = (p: { exemplaires: { hidden?: boolean }[] }) =>
  p.exemplaires.length > 0 && p.exemplaires.every((x) => x.hidden === true);

/** Entrées uniques : celles des sortes du bloc « details », sinon des sortes possédées une fois. */
function taglineOf(fiche: Fiche, details: DetailsWidget | undefined): string {
  const kinds = details
    ? details.sortes
    : [...fiche.systeme.sortes.values()]
        .filter((s) => s.maximum === 1 && s.pour.includes(fiche.etat.type))
        .map((s) => s.id);
  const names: string[] = [];
  for (const kind of kinds)
    for (const p of fiche.possessions.values())
      if (p.sorte.id === kind && !hiddenFromOthers(p)) names.push(p.entree.nom);
  return names.join(' · ');
}

/** Valeurs clés : celles du bloc « details », puis les ressources visibles de tous. */
function highlightsOf(
  fiche: Fiche,
  details: DetailsWidget | undefined,
): CharacterSummary['highlights'] {
  const highlights: CharacterSummary['highlights'] = [];
  for (const key of details?.attributs ?? []) {
    const a = fiche.entite.attributs.get(key);
    const v = fiche.valeurs.get(key);
    if (a && v && a.nature !== 'texte') highlights.push({ label: a.nom, value: display(v) });
  }
  for (const a of fiche.entite.attributs.values()) {
    if (a.nature !== 'ressource' || a.visibilite === 'mj' || highlights.length >= HIGHLIGHTS_MAX)
      continue;
    const v = fiche.valeurs.get(a.cle);
    if (v) highlights.push({ label: a.abrege ?? a.nom, value: `${display(v)}/${v.max ?? '—'}` });
  }
  return highlights;
}

/** Résumé d'une fiche calculée, selon la présentation de son système (facultative). */
export function summarize(fiche: Fiche, presentation: Presentation | null): CharacterSummary {
  const details = detailsWidget(fiche, presentation);
  return { tagline: taglineOf(fiche, details), highlights: highlightsOf(fiche, details) };
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

/** Résumés gardés en mémoire, par `id:version:options` (les plus anciens sortent d'abord). */
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
  /** Règles optionnelles du calcul : un autre réglage donne un autre résumé. */
  options: Readonly<Record<string, boolean>> = {},
): CharacterSummary {
  const reglages = Object.entries(options)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  const key = `${character.id}:${character.version}:${reglages}`;
  const known = cache.get(key);
  if (known) return known;
  const summary = summarize(fiche(), presentationOf(catalogue, character.systemId));
  cache.set(key, summary);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return summary;
}
