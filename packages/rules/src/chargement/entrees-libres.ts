/**
 * Entrées libres d'une entité (`etat.entrees`, docs/entrees-libres.md) : hors du catalogue de
 * son système, d'une sorte `personnalisable`. `systemePour` donne le système vu par cette
 * entité, catalogue complété ; `erreursEntreesLibres` vérifie une écriture qui en pose.
 */
import { PREFIXE_ENTREE_LIBRE, type Entree, type EtatEntite } from '../schema/index.js';
import { etendre, type ErreurChargement, type SystemeCharge } from './charger.js';
import { avecOptions } from './options.js';

/** Systèmes étendus gardés par système de départ (les plus récents d'abord retirés en dernier). */
const MAX_PAR_BASE = 64;
const etendus = new WeakMap<SystemeCharge, Map<string, SystemeCharge>>();

/** Système d'où part `systeme`, sans entrée libre, avec les réglages de campagne qu'il porte. */
function sansLibres(systeme: SystemeCharge): SystemeCharge {
  const l = systeme.libres;
  return l ? avecOptions(l.base, systeme.optionsCampagne) : systeme;
}

/** Erreurs propres aux entrées libres, avant toute compilation. */
function erreursForme(systeme: SystemeCharge, type: string, entrees: readonly Entree[]) {
  const erreurs: ErreurChargement[] = [];
  for (const e of entrees) {
    const chemin = `entrees/${e.id}`;
    const sorte = systeme.sortes.get(e.sorte);
    if (!e.id.startsWith(PREFIXE_ENTREE_LIBRE))
      erreurs.push({ chemin, message: `Identifiant attendu : ${PREFIXE_ENTREE_LIBRE}…` });
    if (!sorte?.personnalisable)
      erreurs.push({ chemin, message: `La sorte ${e.sorte} n’admet pas d’entrée libre` });
    else if (!sorte.pour.includes(type))
      erreurs.push({ chemin, message: `Une entrée ${sorte.nom} ne va pas sur ${type}` });
    if (e.donne) erreurs.push({ chemin, message: 'Effets donnés non pris en charge' });
    if (e.libre) erreurs.push({ chemin, message: 'Entrée générique non prise en charge' });
  }
  return erreurs;
}

function etendrePour(
  base: SystemeCharge,
  type: string,
  entrees: readonly Entree[],
  cle: string,
): { ok: true; systeme: SystemeCharge } | { ok: false; erreurs: ErreurChargement[] } {
  let parBase = etendus.get(base);
  const deja = parBase?.get(`${type}\n${cle}`);
  if (deja) return { ok: true, systeme: deja };
  const forme = erreursForme(base, type, entrees);
  if (forme.length) return { ok: false, erreurs: forme };
  const r = etendre(base, entrees);
  if (!r.ok) return r;
  const systeme: SystemeCharge = { ...r.systeme, libres: { base, cle } };
  if (!parBase) etendus.set(base, (parBase = new Map()));
  if (parBase.size >= MAX_PAR_BASE) parBase.delete(parBase.keys().next().value!);
  parBase.set(`${type}\n${cle}`, systeme);
  return { ok: true, systeme };
}

/**
 * Système vu par l'entité : celui reçu, complété de ses entrées libres. Sans entrée libre, le
 * système de départ ; déjà étendu de ces mêmes entrées, inchangé. Des entrées libres invalides
 * (refusées à l'écriture, voir `erreursEntreesLibres`) sont ignorées : le calcul continue avec
 * le catalogue seul.
 */
export function systemePour(
  systeme: SystemeCharge,
  etat: Pick<EtatEntite, 'type' | 'entrees'>,
): SystemeCharge {
  const entrees = etat.entrees ?? [];
  const cle = entrees.length ? JSON.stringify(entrees) : '';
  if ((systeme.libres?.cle ?? '') === cle) return systeme;
  const base = sansLibres(systeme);
  if (!cle) return base;
  const r = etendrePour(base, etat.type, entrees, cle);
  return r.ok ? r.systeme : base;
}

/** Erreurs des entrées libres d'un état ; vide si elles se chargent toutes. */
export function erreursEntreesLibres(
  systeme: SystemeCharge,
  etat: Pick<EtatEntite, 'type' | 'entrees'>,
): ErreurChargement[] {
  const entrees = etat.entrees ?? [];
  if (!entrees.length) return [];
  const r = etendrePour(sansLibres(systeme), etat.type, entrees, JSON.stringify(entrees));
  return r.ok ? [] : r.erreurs;
}
