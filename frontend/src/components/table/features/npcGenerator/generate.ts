/**
 * Générateur de PNJ express : un nom selon le peuple, un métier, un trait, une manie, une voix,
 * une motivation et un secret, tirés des listes de la langue de la page (`data/<langue>.json`).
 */
import en from './data/en.json';
import fr from './data/fr.json';

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

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

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
