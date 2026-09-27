/**
 * Outils de l'assistant de création et des fiches, sans interface : tout est
 * lu dans le système et sa présentation (aucune clé de jeu ici).
 */
import {
  chemins,
  EtatEntite,
  essayer,
  type Attribut,
  type Effet,
  type Entree,
  type Fiche,
  type Presentation,
  type SystemeCharge,
  type ValeurCalculee,
} from '@vtt/rules';
import type { ResumePersonnage } from './personnages';

/** État vierge d'une entité en création. */
export function etatInitial(systeme: SystemeCharge, type = 'personnage'): EtatEntite {
  return EtatEntite.parse({
    type,
    systeme: { id: systeme.source.id, version: systeme.source.version },
    creation: true,
  });
}

/** Entrées d'une sorte, dans l'ordre du catalogue. */
export function entreesDeSorte(systeme: SystemeCharge, sorte: string): Entree[] {
  return [...systeme.entrees.values()].filter((e) => e.sorte === sorte);
}

/**
 * Entrées suggérées pour une étape « choisir » : celles que désignent les
 * champs des entrées déjà possédées (voies d'un profil, voie d'une race…).
 */
export function suggestions(systeme: SystemeCharge, etat: EtatEntite, sorte: string): string[] {
  const ids = new Set<string>();
  for (const p of etat.possessions) {
    const e = systeme.entrees.get(p.entree);
    if (!e || e.sorte === sorte) continue;
    for (const c of systeme.sortes.get(e.sorte)?.champs ?? []) {
      if ((c.type !== 'entree' && c.type !== 'entrees') || c.sorte !== sorte) continue;
      const v = e.champs[c.id];
      for (const id of Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
        if (systeme.entrees.has(id)) ids.add(id);
    }
  }
  return [...ids];
}

/** Raison pour laquelle une entrée ne peut pas être prise (prérequis `exige`), ou null. */
export function prerequisManquant(fiche: Fiche, e: Entree): string | null {
  const f = fiche.systeme.formules.get(chemins.exige(e.id));
  if (!f) return null;
  const r = essayer(fiche, f);
  if (!r.ok) return r.message;
  return r.valeur === true ? null : `Prérequis : ${f.texte}`;
}

function signe(n: number) {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Libellé court d'un attribut (abréviation, sinon nom). */
export function libelleAttribut(fiche: Fiche, cle: string): string {
  const a = fiche.entite.attributs.get(cle);
  return a ? (a.abrege ?? a.nom) : cle;
}

/** Effet lisible : « CHA +2 », « Rang 1 : Grâce elfique »… ; null si rien d'utile à dire. */
export function texteEffet(fiche: Fiche, e: Effet): string | null {
  if (e.description && e.sur !== 'attribut') return e.description;
  switch (e.sur) {
    case 'attribut': {
      const nom = libelleAttribut(fiche, e.attribut);
      const n = Number(e.valeur);
      const v = Number.isFinite(n) ? n : e.valeur;
      const cond = e.condition ? ' (sous condition)' : '';
      switch (e.operation) {
        case 'ajouter':
          return `${nom} ${typeof v === 'number' ? signe(v) : `+ ${v}`}${cond}`;
        case 'multiplier':
          return `${nom} ×${v}${cond}`;
        case 'fixer':
          return `${nom} = ${v}${cond}`;
        case 'minimum':
          return `${nom} au moins ${v}${cond}`;
        case 'maximum':
          return `${nom} au plus ${v}${cond}`;
      }
      return null;
    }
    case 'rang': {
      const cible = fiche.systeme.entrees.get(e.entree);
      if (!cible) return null;
      const seuil = /rang\s*>=\s*(\d+)/.exec(e.condition ?? '')?.[1];
      return seuil ? `Rang ${seuil} : ${cible.nom}` : `Accorde : ${cible.nom}`;
    }
    case 'marque': {
      const noms = e.entrees.map((id) => fiche.systeme.entrees.get(id)?.nom ?? id);
      return `${noms.slice(0, 4).join(', ')}${noms.length > 4 ? ` et ${noms.length - 4} autres` : ''}`;
    }
    case 'jet':
      return 'Modifie certains jets';
    case 'degats':
      return e.operation === 'annuler'
        ? 'Immunité à certains dégâts'
        : e.operation === 'multiplier'
          ? 'Résistance à certains dégâts'
          : `Réduction des dégâts ${e.valeur}`;
  }
}

/** Valeurs des champs d'une entrée, avec le nom du champ (taille moyenne, dé de vie…). */
export function champsLisibles(
  systeme: SystemeCharge,
  e: Entree,
): { nom: string; valeur: string }[] {
  const sorte = systeme.sortes.get(e.sorte);
  const r: { nom: string; valeur: string }[] = [];
  for (const c of sorte?.champs ?? []) {
    const v = e.champs[c.id];
    if (v === undefined || v === '' || c.type === 'entrees') continue;
    if (c.type === 'entree') {
      const cible = typeof v === 'string' ? systeme.entrees.get(v) : undefined;
      if (cible) r.push({ nom: c.nom, valeur: cible.nom });
    } else if (typeof v === 'boolean') {
      if (v) r.push({ nom: c.nom, valeur: 'oui' });
    } else if (c.type === 'choix')
      r.push({ nom: c.nom, valeur: c.options.find((o) => o.valeur === v)?.nom ?? String(v) });
    else r.push({ nom: c.nom, valeur: String(v) });
  }
  return r;
}

/** Valeur calculée affichable (« 14 », « oui », texte). */
export function afficherValeur(v: ValeurCalculee | undefined): string {
  if (!v) return '—';
  if (typeof v.valeur === 'boolean') return v.valeur ? 'oui' : 'non';
  if (typeof v.valeur === 'number')
    return Number.isInteger(v.valeur) ? String(v.valeur) : v.valeur.toFixed(1);
  return v.valeur || '—';
}

export function afficherModificateur(m: number | undefined): string | null {
  return m === undefined ? null : signe(m);
}

/** Explication d'une valeur, une ligne par contribution (« Elfe : +2 »). */
export function explication(v: ValeurCalculee | undefined): string[] {
  if (!v) return [];
  return v.detail
    .filter((l) => !l.ignore)
    .map((l) => {
      const val = typeof l.valeur === 'number' ? l.valeur : String(l.valeur);
      // Effet coupé dans le bloc Bonus : listé, sans compter
      if (l.desactive)
        return `${l.nom} : ${typeof val === 'number' ? signe(val) : val} (désactivé)`;
      switch (l.operation) {
        case 'base':
          return `Base : ${val}`;
        case 'formule':
          return `${l.nom} = ${val}`;
        case 'ajouter':
          return `${l.nom} : ${typeof val === 'number' ? signe(val) : val}`;
        case 'multiplier':
          return `${l.nom} : ×${val}`;
        default:
          return `${l.nom} : ${val}`;
      }
    });
}

/** Attributs numériques affichables d'une fiche (hors texte), par groupe déclaré. */
export function groupesAttributs(
  fiche: Fiche,
): { id: string; nom: string; attributs: Attribut[] }[] {
  const groupes = fiche.entite.type.groupes.map((g) => ({ ...g, attributs: [] as Attribut[] }));
  for (const a of fiche.entite.attributs.values()) {
    if (
      a.visibilite === 'mj' ||
      a.nature === 'texte' ||
      a.nature === 'choix' ||
      a.nature === 'booleen'
    )
      continue;
    if (a.nature === 'derivee' && a.type !== 'nombre') continue;
    groupes.find((g) => g.id === a.groupe)?.attributs.push(a);
  }
  return groupes.filter((g) => g.attributs.length > 0);
}

/** Widgets de la fiche déclarés par la présentation pour ce type d'entité. */
export function widgetsFiche(presentation: Presentation | null | undefined, type: string) {
  return presentation?.fiches[type]?.widgets ?? [];
}

/**
 * Résumé d'un personnage pour les listes : entrées uniques et valeurs du
 * premier bloc « details » de la présentation (sinon les sortes à une seule
 * entrée), et les ressources.
 */
export function resumer(
  fiche: Fiche,
  presentation: Presentation | null | undefined,
): ResumePersonnage {
  const details = widgetsFiche(presentation, fiche.etat.type).find((w) => w.type === 'details');
  const sortes =
    details?.type === 'details'
      ? details.sortes
      : [...fiche.systeme.sortes.values()]
          .filter((s) => s.maximum === 1 && s.pour.includes(fiche.etat.type))
          .map((s) => s.id);
  const noms: string[] = [];
  for (const sorte of sortes)
    for (const p of fiche.possessions.values()) if (p.sorte.id === sorte) noms.push(p.entree.nom);

  const highlights: ResumePersonnage['highlights'] = [];
  if (details?.type === 'details') {
    for (const cle of details.attributs) {
      const a = fiche.entite.attributs.get(cle);
      const v = fiche.valeurs.get(cle);
      if (a && v && a.nature !== 'texte')
        highlights.push({ label: a.nom, value: afficherValeur(v) });
    }
  }
  for (const a of fiche.entite.attributs.values()) {
    if (a.nature !== 'ressource' || a.visibilite === 'mj' || highlights.length >= 3) continue;
    const v = fiche.valeurs.get(a.cle);
    if (v)
      highlights.push({ label: a.abrege ?? a.nom, value: `${afficherValeur(v)}/${v.max ?? '—'}` });
  }
  return { tagline: noms.join(' · '), highlights };
}

/** Mots-clés (sans accents, minuscules) des entrées uniques : pour suggérer des portraits. */
export function motsClesPortrait(fiche: Fiche): string[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return [...fiche.possessions.values()]
    .filter((p) => p.sorte.maximum === 1)
    .flatMap((p) => [norm(p.entree.nom), ...norm(p.entree.nom).split(/\s+/)]);
}
