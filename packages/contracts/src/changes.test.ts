import { describe, expect, it } from 'vitest';
import { changesPayload, deepEqual, diffValues } from './changes.js';

const POSSESSIONS = { identityKeys: ['id', ['entree', 'exemplaire']] } as const;

describe('diffValues', () => {
  it('rapporte un attribut modifié avec son chemin', () => {
    const d = diffValues(
      { etat: { valeurs: { PV: 24, FOR: 14 } }, nom: 'Gimli' },
      { etat: { valeurs: { PV: 17, FOR: 14 } }, nom: 'Gimli' },
    );
    expect(d).toEqual({
      changes: [{ path: 'etat.valeurs.PV', before: 24, after: 17 }],
      truncated: false,
    });
  });

  it('omet before pour un ajout et after pour un retrait', () => {
    const d = diffValues({ a: 1, b: null }, { b: null, c: 'x' });
    expect(d.changes).toEqual([
      { path: 'a', before: 1 },
      { path: 'c', after: 'x' },
    ]);
  });

  it('distingue null d’une absence', () => {
    expect(diffValues({ avatarUrl: null }, { avatarUrl: 'https://x/a.png' }).changes).toEqual([
      { path: 'avatarUrl', before: null, after: 'https://x/a.png' },
    ]);
    // Une clé à undefined compte comme absente
    expect(diffValues({ a: undefined }, {}).changes).toEqual([]);
  });

  it('ne rapporte rien pour deux valeurs égales', () => {
    const v = { etat: { possessions: [{ entree: 'epee', rang: 0 }], noeuds: { a: ['x'] } } };
    expect(diffValues(v, structuredClone(v))).toEqual({ changes: [], truncated: false });
  });

  it('repère les éléments par identifiant composé plutôt que par index', () => {
    const avant = {
      possessions: [
        { entree: 'epee-longue', rang: 0 },
        { entree: 'fleche', exemplaire: '2', quantite: 20 },
      ],
    };
    const apres = {
      possessions: [
        { entree: 'fleche', exemplaire: '2', quantite: 17 },
        { entree: 'potion', rang: 0 },
      ],
    };
    expect(diffValues(avant, apres, POSSESSIONS).changes).toEqual([
      { path: 'possessions[epee-longue]', before: { entree: 'epee-longue', rang: 0 } },
      { path: 'possessions[fleche#2].quantite', before: 20, after: 17 },
      { path: 'possessions[potion]', after: { entree: 'potion', rang: 0 } },
    ]);
  });

  it('prend `id` par défaut et met entre guillemets un identifiant numérique', () => {
    const d = diffValues(
      {
        bonus: [
          { id: 'b1', actif: true },
          { id: '7', actif: true },
        ],
      },
      {
        bonus: [
          { id: 'b1', actif: false },
          { id: '7', actif: true },
        ],
      },
    );
    expect(d.changes).toEqual([{ path: 'bonus[b1].actif', before: true, after: false }]);
    const n = diffValues({ l: [{ id: '7', v: 1 }] }, { l: [{ id: '7', v: 2 }] });
    expect(n.changes).toEqual([{ path: 'l["7"].v', before: 1, after: 2 }]);
  });

  it('retombe sur les index si une identité manque ou se répète', () => {
    const d = diffValues(
      {
        l: [
          { id: 'a', v: 1 },
          { id: 'a', v: 2 },
        ],
      },
      {
        l: [
          { id: 'a', v: 1 },
          { id: 'a', v: 3 },
        ],
      },
    );
    expect(d.changes).toEqual([{ path: 'l[1].v', before: 2, after: 3 }]);
  });

  it('par index, retire le début et la fin communs', () => {
    const ligne = (n: number) => ({ achat: 'xp', objet: `o${n}`, cout: n });
    const avant = { journal: [ligne(1), ligne(2), ligne(3), ligne(4)] };
    const apres = { journal: [ligne(1), ligne(3), ligne(4)] };
    expect(diffValues(avant, apres).changes).toEqual([{ path: 'journal[1]', before: ligne(2) }]);
    expect(diffValues(apres, avant).changes).toEqual([{ path: 'journal[1]', after: ligne(2) }]);
  });

  it('rapporte un tableau de valeurs simples en entier', () => {
    const d = diffValues({ noeuds: { voie: ['a', 'b'] } }, { noeuds: { voie: ['a', 'b', 'c'] } });
    expect(d.changes).toEqual([
      { path: 'noeuds.voie', before: ['a', 'b'], after: ['a', 'b', 'c'] },
    ]);
  });

  it('met entre guillemets une clé qui n’est pas un identifiant simple', () => {
    const d = diffValues({ champs: { 'a b': 1, 'é-2': 1 } }, { champs: { 'a b': 2, 'é-2': 2 } });
    expect(d.changes.map((c) => c.path)).toEqual(['champs["a b"]', 'champs.é-2']);
  });

  it('rapporte un changement de nature en entier', () => {
    expect(diffValues({ v: [1] }, { v: { a: 1 } }).changes).toEqual([
      { path: 'v', before: [1], after: { a: 1 } },
    ]);
  });

  it('s’arrête à la profondeur maximale et rapporte la valeur entière', () => {
    const d = diffValues(
      { a: { b: { c: { d: 1 } } } },
      { a: { b: { c: { d: 2 } } } },
      { maxDepth: 2 },
    );
    expect(d).toEqual({
      changes: [{ path: 'a.b', before: { c: { d: 1 } }, after: { c: { d: 2 } } }],
      truncated: false,
    });
  });

  it('coupe les textes longs et le signale', () => {
    const d = diffValues({ bio: 'x'.repeat(50) }, { bio: 'y' }, { maxStringLength: 10 });
    expect(d.truncated).toBe(true);
    expect(d.changes).toEqual([
      { path: 'bio', before: `${'x'.repeat(10)}…`, after: 'y', truncated: true },
    ]);
  });

  it('remplace un objet trop long par un aperçu de son JSON', () => {
    const gros = { effets: Array.from({ length: 50 }, (_, i) => ({ cle: `k${i}` })) };
    const d = diffValues(
      { l: [] as unknown[] },
      { l: [gros] },
      {
        maxValueLength: 100,
        maxStringLength: 20,
      },
    );
    expect(d.truncated).toBe(true);
    expect(d.changes[0]).toEqual({
      path: 'l[0]',
      after: `${JSON.stringify(gros).slice(0, 20)}…`,
      truncated: true,
    });
  });

  it('limite le nombre de changements', () => {
    const avant = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]));
    const apres = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i + 1]));
    const d = diffValues(avant, apres, { maxChanges: 5 });
    expect(d.changes).toHaveLength(5);
    expect(d.truncated).toBe(true);
    // Pile à la limite : rien d'omis
    expect(diffValues({ a: 1 }, { a: 2 }, { maxChanges: 1 }).truncated).toBe(false);
  });

  it('borne la taille totale, même avec beaucoup de gros changements', () => {
    const texte = (c: string) => c.repeat(5000);
    const avant = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, texte('a')]));
    const apres = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`k${i}`, texte('b')]));
    const d = diffValues(avant, apres, { maxChanges: 1000 });
    expect(d.truncated).toBe(true);
    expect(JSON.stringify(d.changes).length).toBeLessThanOrEqual(64_000);
  });

  it('ignore une option à undefined', () => {
    const d = diffValues({ a: 1 }, { a: 2 }, { maxChanges: undefined as unknown as number });
    expect(d.changes).toHaveLength(1);
  });

  it('convertit les dates en texte ISO', () => {
    const d = diffValues(
      { t: new Date('2026-01-01T00:00:00Z') },
      { t: new Date('2026-01-02T00:00:00Z') },
    );
    expect(d.changes).toEqual([
      { path: 't', before: '2026-01-01T00:00:00.000Z', after: '2026-01-02T00:00:00.000Z' },
    ]);
  });
});

describe('changesPayload', () => {
  it('n’ajoute truncated que si quelque chose est coupé', () => {
    expect(changesPayload({ a: 1 }, { a: 2 })).toEqual({
      changes: [{ path: 'a', before: 1, after: 2 }],
    });
    expect(changesPayload({ a: 'xx' }, { a: 'y' }, { maxStringLength: 1 }).truncated).toBe(true);
  });
});

describe('deepEqual', () => {
  it('compare en profondeur, clés à undefined comprises', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(deepEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: 1 }, [1])).toBe(false);
  });
});
