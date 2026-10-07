/**
 * Catalogues (docs/i18n.md § 9) : chaque langue a exactement les clés du français, les mêmes
 * arguments et balises, une syntaxe ICU valide et aucun texte vide.
 */
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { LOCALES } from './config';
import { readIcu, type IcuArgType } from './icu';
import { CATALOGS, loadMessages, mergeOnto } from './messages';
import fr from './messages/fr';

type Tree = { readonly [key: string]: string | Tree };

function flatten(tree: Tree, prefix = '', out = new Map<string, string>()) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

const reference = flatten(fr);

function sampleValue(type: IcuArgType) {
  if (type === 'date' || type === 'time') return new Date(0);
  if (type === 'text' || type === 'select') return 'other';
  return 1;
}

describe('catalogue de référence (français)', () => {
  it('a des clés sans point ni espace, et aucun texte vide', () => {
    for (const [key, value] of reference) {
      expect(
        key.split('.').every((part) => /^[A-Za-z0-9_]+$/.test(part)),
        key,
      ).toBe(true);
      expect(value.trim(), key).not.toBe('');
    }
  });
});

describe.each(LOCALES)('catalogue %s', (locale) => {
  const messages = flatten(CATALOGS[locale] as Tree);

  it('a exactement les clés du français', () => {
    const missing = [...reference.keys()].filter((k) => !messages.has(k));
    const extra = [...messages.keys()].filter((k) => !reference.has(k));
    expect(missing, 'clés manquantes').toEqual([]);
    expect(extra, 'clés en trop').toEqual([]);
  });

  it('garde les arguments et les balises de chaque message', () => {
    for (const [key, source] of reference) {
      const translated = messages.get(key);
      if (translated === undefined) continue;
      const a = readIcu(source);
      const b = readIcu(translated);
      expect(Object.fromEntries(b.args), key).toEqual(Object.fromEntries(a.args));
      expect([...b.tags].sort(), key).toEqual([...a.tags].sort());
    }
  });

  it('formate chaque message sans erreur', () => {
    const errors: string[] = [];
    const t = createTranslator({
      locale,
      messages: loadMessages(locale),
      timeZone: 'UTC',
      onError: (e) => errors.push(e.message),
    });
    for (const [key, source] of reference) {
      const { args, tags } = readIcu(source);
      const values: Record<string, unknown> = {};
      for (const [name, type] of args) values[name] = sampleValue(type);
      for (const tag of tags) values[tag] = (chunks: string) => chunks;
      const out = (t.markup as (k: string, v: Record<string, unknown>) => string)(key, values);
      expect(out.trim(), key).not.toBe('');
    }
    expect(errors).toEqual([]);
  });

  it('n’a aucun texte vide', () => {
    for (const [key, value] of messages) expect(value.trim(), key).not.toBe('');
  });

  it('n’ouvre jamais une citation ICU par erreur (apostrophe droite devant { } # <)', () => {
    for (const [key, value] of messages) expect(/'[{}#<]/.test(value), key).toBe(false);
  });
});

describe('repli sur le français', () => {
  it('une clé absente d’une traduction s’affiche en français', () => {
    const merged = mergeOnto({ a: 'A', b: { c: 'C', d: 'D' } }, { b: { c: 'see' } }) as Tree;
    expect(merged).toEqual({ a: 'A', b: { c: 'see', d: 'D' } });
  });
});
