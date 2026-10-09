/**
 * Usages limités (docs/regles.md « Usages limités ») : une entrée qui se dit « une fois par
 * combat » déclare `usages: { max, par }` ; l'état compte les utilisations consommées
 * (`etat.usages`), rendues à la fin de leur période : fin de round pour `tour`, fin du combat
 * pour `tour` et `combat`, repos pour toutes.
 */
import { systemePour } from '../chargement/entrees-libres.js';
import type { Fiche } from '../calcul/index.js';
import { chemins, type SystemeCharge } from '../chargement/index.js';
import type { EtatEntite, PeriodeUsages } from '../schema/index.js';

/** Utilisations d'une entrée pour une fiche. */
export interface Usages {
  /** Utilisations permises par période (formule `usages.max` sur le porteur). */
  max: number;
  utilises: number;
  restants: number;
  par: PeriodeUsages;
}

/** Libellé de la période : « par tour », « par combat », « par jour ». */
export const LIBELLES_PERIODE: Readonly<Record<PeriodeUsages, string>> = {
  tour: 'par tour',
  combat: 'par combat',
  jour: 'par jour',
};

/** Usages de l'entrée sur cette fiche ; absent : l'entrée n'en déclare pas. */
export function usagesDe(fiche: Fiche, entree: string): Usages | undefined {
  const e = fiche.systeme.entrees.get(entree);
  if (!e?.usages) return undefined;
  const f = fiche.systeme.formules.get(chemins.usages(entree));
  const max = Math.max(0, Math.floor(Number(f ? fiche.evaluer(f, {}, 1) : 1)) || 0);
  // Un état enregistré avant les usages limités n'a pas de `usages`
  const utilises = fiche.etat.usages?.[entree] ?? 0;
  return { max, utilises, restants: Math.max(0, max - utilises), par: e.usages.par };
}

export type ResultatUsage = { ok: true; etat: EtatEntite } | { ok: false; erreur: string };

/**
 * Consomme une utilisation de l'entrée, ou en rend une (`rendre` : correction à la main).
 * Refusé si l'entrée n'a pas d'usages limités, ou s'il n'en reste plus à consommer.
 */
export function utiliser(fiche: Fiche, entree: string, rendre = false): ResultatUsage {
  const u = usagesDe(fiche, entree);
  const nom = fiche.systeme.entrees.get(entree)?.nom ?? entree;
  if (!u) return { ok: false, erreur: `${nom} n’a pas d’usages limités` };
  if (!rendre && u.restants <= 0)
    return {
      ok: false,
      erreur: `${nom} : plus d’utilisation (${u.max} ${LIBELLES_PERIODE[u.par]})`,
    };
  const n = rendre ? Math.max(0, Math.min(u.utilises, u.max) - 1) : u.utilises + 1;
  const usages = { ...(fiche.etat.usages ?? {}) };
  if (n > 0) usages[entree] = n;
  else delete usages[entree];
  return { ok: true, etat: { ...fiche.etat, usages } };
}

/** Périodes closes par des événements de combat : fin de round, fin du combat. */
export function periodesCloses(evenements: readonly { type: string }[]): PeriodeUsages[] {
  if (evenements.some((e) => e.type === 'fin-combat')) return ['tour', 'combat'];
  if (evenements.some((e) => e.type === 'fin-round')) return ['tour'];
  return [];
}

/** Toutes les périodes : un repos rend toutes les utilisations. */
export const PERIODES_REPOS: readonly PeriodeUsages[] = ['tour', 'combat', 'jour'];

/**
 * Rend les utilisations des entrées dont la période est close (et oublie celles d'une entrée
 * qui n'a plus d'usages limités) ; absent : rien ne change.
 */
export function remettreUsages(
  systeme: SystemeCharge,
  etat: EtatEntite,
  periodes: readonly PeriodeUsages[],
): EtatEntite | undefined {
  systeme = systemePour(systeme, etat);
  const closes = new Set(periodes);
  const usages: Record<string, number> = {};
  let change = false;
  for (const [id, n] of Object.entries(etat.usages ?? {})) {
    const par = systeme.entrees.get(id)?.usages?.par;
    if (!par || closes.has(par)) change = true;
    else usages[id] = n;
  }
  return change ? { ...etat, usages } : undefined;
}
