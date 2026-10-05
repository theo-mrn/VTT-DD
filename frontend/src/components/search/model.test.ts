/**
 * Index de la recherche ⌘K sur les vrais systèmes (public/systemes) : rubriques déclarées par
 * chaque système, classement et recherche sans accents.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { charger, Presentation, type SystemeCharge } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import type { BestiaryItem } from '../resources/model/bestiary';
import { ALL, buildSearchIndex, searchIndex } from './model';

const PUBLIC = fileURLToPath(new URL('../../../public/systemes/', import.meta.url));

function load(id: string): { systeme: SystemeCharge; presentation: Presentation } {
  const r = charger(JSON.parse(readFileSync(`${PUBLIC}${id}.json`, 'utf8')));
  if (!r.ok) throw new Error(r.erreurs[0]?.message);
  const presentation = Presentation.parse(
    JSON.parse(readFileSync(`${PUBLIC}${id}.presentation.json`, 'utf8')),
  );
  return { systeme: r.systeme, presentation };
}

const creature = (name: string): BestiaryItem => ({
  key: `system:${name}`,
  source: 'system',
  name,
  category: 'Bête',
  subtitle: null,
  image: null,
  description: 'Une créature des marais.',
  stats: [],
  actions: [],
  text: name.toLowerCase(),
});

describe('recherche dans les règles', () => {
  const dnd = load('dnd-classic');
  const index = buildSearchIndex({
    ...dnd,
    creatures: [
      {
        item: creature('Gobelin'),
        placement: {
          key: 'bestiary:gobelin',
          name: 'Gobelin',
          imageUrl: null,
          source: { bestiary: { systemeId: 'dnd-classic', key: 'gobelin' } },
        },
      },
    ],
  });

  it('rubriques déclarées par le système, dans son ordre, sans rubrique vide', () => {
    const declared = dnd.presentation.references.capacites!.sections.map((s) => s.titre);
    const tabs = index.tabs.map((t) => t.label);
    expect(tabs.slice(0, declared.length)).toEqual(declared);
    expect(index.tabs.every((t) => t.count > 0)).toBe(true);
    expect(index.tabs.some((t) => t.kind === 'marche')).toBe(true);
    expect(index.tabs.at(-1)).toMatchObject({ id: 'bestiaire', count: 1 });
  });

  it('sans bestiaire ni créature : pas de rubrique Bestiaire', () => {
    const sans = buildSearchIndex({ ...dnd, creatures: [] });
    expect(sans.tabs.some((t) => t.kind === 'bestiaire')).toBe(false);
  });

  it('« Tout » sans saisie : rien ; une rubrique sans saisie : tout son contenu', () => {
    expect(searchIndex(dnd.systeme, index, '', ALL)).toEqual([]);
    const first = index.tabs[0]!;
    const hits = searchIndex(dnd.systeme, index, '', first.id, 500);
    expect(hits).toHaveLength(first.count);
  });

  it('classe le titre exact puis le début du titre avant le texte, sans accents ni majuscules', () => {
    const races = index.items.filter((i) => i.tab === index.tabs[0]!.id);
    const name = races[0]!.title;
    const hits = searchIndex(dnd.systeme, index, name.toUpperCase(), ALL);
    expect(hits[0]!.item.title).toBe(name);
    const accentless = name.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    expect(searchIndex(dnd.systeme, index, accentless, ALL)[0]!.item.title).toBe(name);
  });

  it('une créature trouvée garde sa source à poser sur la carte', () => {
    const [hit] = searchIndex(dnd.systeme, index, 'gob', 'bestiaire');
    expect(hit!.item.placement).toMatchObject({
      key: 'bestiary:gobelin',
      source: { bestiary: { systemeId: 'dnd-classic', key: 'gobelin' } },
    });
  });

  it('Star Wars : ses propres rubriques (espèces, carrières, talents…)', () => {
    const sw = load('star-wars-eote');
    const swIndex = buildSearchIndex({ ...sw, creatures: [] });
    const declared = sw.presentation.references.capacites!.sections.map((s) => s.titre);
    expect(swIndex.tabs.map((t) => t.label).slice(0, declared.length)).toEqual(declared);
    expect(swIndex.tabs.some((t) => t.kind === 'bestiaire')).toBe(false);
  });
});
