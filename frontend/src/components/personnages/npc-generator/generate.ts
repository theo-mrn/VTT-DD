/**
 * Générateur de PNJ (création dans Mes PNJ) : un nom selon le peuple, des valeurs clés (celles
 * d'une créature du bestiaire prise pour base, sinon tirées autour des défauts du système), et
 * de quoi l'improviser — métier, trait, manie, voix, motivation, secret — tirés des listes de la
 * langue de la page (`data/<langue>.json`), non enregistrés.
 */
import type { Attribut, Valeur } from '@vtt/rules';
import en from './data/en.json';
import fr from './data/fr.json';
import { pickRandom, random } from '@/lib/random-id';

export type NpcData = typeof fr;
export type Culture = NpcData['cultures'][number];
export type Gender = 'male' | 'female';

/** Lignes d'un PNJ tiré ; libellé : `table.npcGenerator.fields.<clé>`. */
export const FIELDS = [
  'occupation',
  'trait',
  'mannerism',
  'voice',
  'motivation',
  'secret',
] as const;
export type Field = (typeof FIELDS)[number];

export interface GeneratedNpc {
  id: string;
  culture: string;
  gender: Gender;
  first: string;
  last: string;
  occupation: string;
  trait: string;
  mannerism: string;
  voice: string;
  motivation: string;
  secret: string;
}

const LISTS: Record<Field, keyof Omit<NpcData, 'cultures'>> = {
  occupation: 'occupations',
  trait: 'traits',
  mannerism: 'mannerisms',
  voice: 'voices',
  motivation: 'motivations',
  secret: 'secrets',
};

export const dataFor = (locale: string): NpcData => (locale.startsWith('en') ? en : fr);

const pick = pickRandom;

export function generateName(culture: Culture, gender: Gender) {
  return { first: pick(culture[gender]), last: pick(culture.last) };
}

export function generateField(data: NpcData, field: Field): string {
  return pick(data[LISTS[field]]);
}

export function generateNpc(
  data: NpcData,
  cultureId: string | null,
  gender: Gender | null,
): GeneratedNpc {
  const culture = data.cultures.find((c) => c.id === cultureId) ?? pick(data.cultures);
  const g = gender ?? pick<Gender>(['male', 'female']);
  return {
    id: crypto.randomUUID(),
    culture: culture.id,
    gender: g,
    ...generateName(culture, g),
    ...(Object.fromEntries(FIELDS.map((f) => [f, generateField(data, f)])) as Record<
      Field,
      string
    >),
  };
}

// ─── Valeurs d'un PNJ tiré sans base ─────────────────────────────────────────

/** Borne numérique d'un attribut (une formule qui n'est pas un simple nombre ne borne pas). */
const borne = (f: unknown) => {
  const n = typeof f === 'number' ? f : typeof f === 'string' ? Number(f) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Valeurs clés tirées autour des défauts du système : une valeur de base varie d'environ 40 %
 * de son défaut (au moins ±2), dans ses bornes ; un choix prend une option au hasard. Aucune clé
 * de jeu en dur : tout vient des attributs.
 */
export function rollValues(attributs: readonly Attribut[], rand = random) {
  const out: Record<string, Valeur> = {};
  for (const a of attributs) {
    if (a.nature === 'base') {
      const ecart = Math.max(2, Math.round(Math.abs(a.defaut) * 0.4));
      let v = a.defaut + Math.round((rand() * 2 - 1) * ecart);
      const min = borne(a.min);
      const max = borne(a.max);
      if (min !== null) v = Math.max(min, v);
      if (max !== null) v = Math.min(max, v);
      out[a.cle] = v;
    } else if (a.nature === 'choix') {
      out[a.cle] = a.options[Math.floor(rand() * a.options.length)]!.valeur;
    }
  }
  return out;
}
