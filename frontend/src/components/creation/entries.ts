/**
 * Lecture d'une entrée pour l'aperçu de la création (sans rendu) : ce que
 * donnent ses effets (modificateurs d'attributs, rangs gratuits, marques),
 * ses choix, ses champs, son image et ses liens avec les possessions déjà
 * faites. Tout vient du système et de la présentation.
 */
import {
  nombreChoix,
  type Arbre,
  type Entree,
  type Fiche,
  type Presentation,
  type SystemeCharge,
} from '@vtt/rules';
import { formatNumber, tagName } from '../sheet/format';
import { readableField } from '../sheet/possessions';
import { attributeChoiceCount } from '../sheet/choice-editor';

export interface AttributeModifier {
  key: string;
  /** Libellé court (abrégé de l'attribut, sinon son nom). */
  short: string;
  name: string;
  /** « +2 », « −1 », « = 100 », « ≥ 3 »… */
  text: string;
  conditional: boolean;
}

export interface EntrySummary {
  modifiers: AttributeModifier[];
  /** Rangs gratuits dans d'autres entrées (capacités, compétences, talents). */
  ranks: { id: string; name: string; description?: string; value: string }[];
  /** Entrées marquées par l'entrée (« Carrière : Athlétisme, Perception… »). */
  tags: { tag: string; names: string[] }[];
  /** Choix demandés à la prise de l'entrée, avec leur nombre évalué sur la fiche. */
  choices: { id: string; name: string; count: number }[];
  /** Champs déclarés par la sorte, lisibles. */
  fields: { id: string; name: string; value: string }[];
}

const BOOLEANS: Record<string, string> = { true: 'Oui', vrai: 'Oui', false: 'Non', faux: 'Non' };

function readableFormula(v: string): string {
  if (v in BOOLEANS) return BOOLEANS[v]!;
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== '' ? formatNumber(n) : v;
}

function signed(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || v.trim() === '') return `+ ${v}`;
  return n < 0 ? `−${formatNumber(-n)}` : `+${formatNumber(n)}`;
}

const OPERATIONS: Record<string, (v: string) => string> = {
  ajouter: signed,
  multiplier: (v) => `×${readableFormula(v)}`,
  fixer: (v) => `= ${readableFormula(v)}`,
  minimum: (v) => `≥ ${readableFormula(v)}`,
  maximum: (v) => `≤ ${readableFormula(v)}`,
};

export function summarizeEntry(sheet: Fiche, entry: Entree): EntrySummary {
  const system = sheet.systeme;
  const attributes = sheet.entite.attributs;
  const modifiers: AttributeModifier[] = [];
  const ranks: EntrySummary['ranks'] = [];
  const tags: EntrySummary['tags'] = [];

  for (const e of entry.effets) {
    if (e.sur === 'attribut') {
      const a = attributes.get(e.attribut);
      // Attributs techniques (réservés au MJ) : pas dans l'aperçu du joueur
      if (!a || a.visibilite === 'mj') continue;
      modifiers.push({
        key: a.cle,
        short: a.abrege ?? a.nom,
        name: a.nom,
        text: (OPERATIONS[e.operation] ?? ((v: string) => v))(e.valeur),
        conditional: !!e.condition,
      });
    } else if (e.sur === 'rang') {
      const target = system.entrees.get(e.entree);
      ranks.push({
        id: e.entree,
        name: target?.nom ?? e.entree,
        ...(target?.description ? { description: target.description } : {}),
        value: signed(e.valeur),
      });
    } else if (e.sur === 'marque') {
      tags.push({
        tag: tagName(e.marque),
        names: e.entrees.map((id) => system.entrees.get(id)?.nom ?? id),
      });
    }
  }

  const choices = [
    ...entry.choix.map((c) => ({
      id: c.id,
      name: c.nom,
      count: nombreChoix(sheet, entry.id, c),
    })),
    ...entry.choixAttributs.map((c) => ({
      id: c.id,
      name: c.nom,
      count: attributeChoiceCount(sheet, entry, c.id),
    })),
  ];

  const kind = system.sortes.get(entry.sorte);
  const fields = (kind?.champs ?? [])
    .filter((c) => entry.champs[c.id] !== undefined)
    .map((c) => ({
      id: c.id,
      name: c.nom,
      value: readableField(system, sheet.etat.type, c, entry.champs[c.id]),
    }));

  return { modifiers, ranks, tags, choices, fields };
}

/** Image d'une entrée déclarée par la présentation. */
export function entryImage(presentation: Presentation, id: string): string | undefined {
  return presentation.images[id];
}

/** Arbres ouverts par la possession de l'entrée (spécialisation…). */
export function treesOpenedBy(system: SystemeCharge, entry: string): Arbre[] {
  return [...system.arbres.values()].filter((a) => a.ouvertPar === entry);
}

/**
 * Liens entre une entrée et les possessions déjà faites, pour proposer
 * d'abord les plus pertinentes : entrée désignée par un champ d'une entrée
 * possédée (voies d'un profil), entrée dont un champ désigne une possession
 * (carrière d'origine d'une spécialisation), entrée marquée par une possession.
 */
export function entryLinks(sheet: Fiche, entry: Entree): string[] {
  const system = sheet.systeme;
  const links = new Set<string>();
  const owned = sheet.etat.possessions.map((p) => p.entree).filter((id) => id !== entry.id);
  const ownedSet = new Set(owned);

  for (const id of owned) {
    const o = system.entrees.get(id);
    if (!o) continue;
    for (const c of system.sortes.get(o.sorte)?.champs ?? []) {
      const v = o.champs[c.id];
      if (c.type === 'entree' && v === entry.id) links.add(o.nom);
      if (c.type === 'entrees' && Array.isArray(v) && v.includes(entry.id)) links.add(o.nom);
    }
    for (const e of o.effets)
      if (e.sur === 'marque' && e.entrees.includes(entry.id)) links.add(o.nom);
  }
  for (const c of system.sortes.get(entry.sorte)?.champs ?? []) {
    const v = entry.champs[c.id];
    if (c.type === 'entree' && typeof v === 'string' && ownedSet.has(v))
      links.add(system.entrees.get(v)?.nom ?? v);
  }
  return [...links];
}
