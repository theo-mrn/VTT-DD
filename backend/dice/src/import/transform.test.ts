import { describe, expect, it } from 'vitest';
import { nameKey, prepareRoll, type Mappings } from './loading.js';
import { splitResults, transformPreferences, transformRoll } from './transform.js';

const doc = (data: Record<string, unknown>, path = 'rolls/ABC123/rolls/r1') => ({
  path,
  id: path.split('/').pop()!,
  data,
});

describe('transformRoll (FirebaseRoll de dice-roller.tsx)', () => {
  it('jet numérique : groupes reconstitués depuis output, dés écartés', () => {
    const r = transformRoll(
      doc({
        isPrivate: false,
        isBlind: false,
        diceCount: 4,
        diceFaces: 6,
        modifier: 0,
        results: [2, 6, 3, 5, 4],
        total: 18,
        userName: 'Aria',
        userAvatar: 'https://img/aria.png',
        type: 'Dice Roller',
        timestamp: 1_700_000_000_000,
        notation: '4d6kh3+1d4+FOR',
        output: '4d6kh3+1d4+0 = [r2, 6, 3, 5]+[4]+0 = 18',
        persoId: 'p1',
        uid: 'u1',
      }),
    );
    expect(r).toMatchObject({
      legacyId: 'rolls/ABC123/rolls/r1',
      campaignCode: 'ABC123',
      uid: 'u1',
      persoId: 'p1',
      userName: 'Aria',
      userAvatar: 'https://img/aria.png',
      visibility: 'public',
      notation: '4d6kh3+1d4+FOR',
      total: 18,
      diceCount: 4,
      diceFaces: 6,
      legacyType: 'Dice Roller',
      warnings: [],
    });
    expect(r.createdAt.getTime()).toBe(1_700_000_000_000);
    expect(r.dice.map((g) => g.values.map((v) => (v.kept ? v.value : -v.value)))).toEqual([
      [-2, 6, 3, 5],
      [4],
    ]);
  });

  it('isBlind et isPrivate ; timestamp balisé ; critique d’un d20', () => {
    const blind = transformRoll(
      doc({
        isBlind: true,
        isPrivate: true,
        results: [20],
        total: 25,
        notation: '1d20+5',
        timestamp: { $timestamp: '2025-01-02T03:04:05.123456789Z' },
      }),
    );
    expect(blind.visibility).toBe('gm');
    expect(blind.outcome).toEqual({ success: null, critical: true, fumble: false });
    expect(blind.createdAt.toISOString()).toBe('2025-01-02T03:04:05.123Z');
    expect(
      transformRoll(doc({ isPrivate: true, results: [1], total: 1, timestamp: 1 })).visibility,
    ).toBe('private');
  });

  it('jet à symboles : faces conservées, total 0', () => {
    const r = transformRoll(
      doc({
        results: [4, 2, 2],
        total: 0,
        symbolResult: '2 Succès nets',
        output: 'Aptitude [4, 2], Difficulté [2] = 2 Succès nets',
        notation: '2ability 1difficulty',
        timestamp: 5,
      }),
    );
    expect(r.symbols!.dice.map((d) => d.face)).toEqual([4, 2, 2]);
    expect(r).toMatchObject({ symbolResult: '2 Succès nets', total: 0, diceCount: 3, dice: [] });
  });

  it('notation illisible : un seul groupe et un avertissement ; sans date : erreur', () => {
    const r = transformRoll(
      doc({ results: [3, 9], diceFaces: 10, total: 12, notation: 'bizarre', timestamp: 5 }),
    );
    expect(r.dice).toEqual([
      {
        faces: 10,
        values: [
          { value: 3, kept: true, exploded: false },
          { value: 9, kept: true, exploded: false },
        ],
      },
    ]);
    expect(r.warnings).toHaveLength(1);
    expect(r.userName).toBe('Aventurier');
    expect(() => transformRoll(doc({ results: [1] }))).toThrow(/timestamp/);
    expect(() => transformRoll(doc({ timestamp: 1 }, 'rolls/ABC'))).toThrow(/Chemin/);
  });

  it('splitResults : nombre de dés ou faces incohérents → null', () => {
    expect(splitResults('2d6', [3])).toBeNull();
    expect(splitResults('1d6', [9])).toBeNull();
    expect(splitResults('1d6', [3, 4])).toBeNull();
    expect(splitResults('2d20kl1', [15, 7])![0]!.values.map((v) => v.kept)).toEqual([false, true]);
  });
});

describe('prepareRoll', () => {
  const maps: Mappings = {
    accounts: new Map([
      ['u1', 'id-u1'],
      ['u2', 'id-u2'],
    ]),
    campaigns: new Map([['ABC123', 'camp-1']]),
    characters: new Map([['cartes/ABC123/characters/p1', 'char-1']]),
    names: new Map([[nameKey('ABC123', 'MJ'), 'u2']]),
  };
  const roll = (data: Record<string, unknown>, path?: string) =>
    transformRoll(
      doc({ results: [5], total: 5, notation: '1d6', timestamp: 1_700_000_000_000, ...data }, path),
    );

  it('rattache campagne, auteur (uid ou nom affiché) et personnage', () => {
    const p = prepareRoll(roll({ uid: 'u1', persoId: 'p1', userName: 'Aria' }), maps);
    expect(p).toMatchObject({
      status: 'ready',
      authorFound: true,
      characterFound: true,
      row: { campaignId: 'camp-1', authorId: 'id-u1', characterId: 'char-1', source: 'import' },
    });
    // Ancien jet sans uid : retrouvé par le nom affiché dans la campagne
    const mj = prepareRoll(roll({ userName: 'MJ' }), maps);
    expect(mj.status === 'ready' && mj.row.authorId).toBe('id-u2');
    // Auteur introuvable : importé sans compte, sous son nom
    const inconnu = prepareRoll(roll({ userName: 'Invité' }), maps);
    expect(inconnu).toMatchObject({
      authorFound: false,
      row: { authorId: null, authorName: 'Invité' },
    });
    // Campagne non importée
    expect(prepareRoll(roll({}, 'rolls/ZZZ/rolls/x'), maps).status).toBe('no-campaign');
  });

  it('identifiant UUIDv7 à la date du jet', () => {
    const p = prepareRoll(roll({ uid: 'u1' }), maps);
    const hex = p.status === 'ready' ? p.row.id!.replace(/-/g, '').slice(0, 12) : '';
    expect(parseInt(hex, 16)).toBe(1_700_000_000_000);
  });
});

describe('transformPreferences', () => {
  const user = (data: Record<string, unknown>) => ({ path: 'users/u1', id: 'u1', data });
  it('skin choisi et inventaire payant ; gratuits et inconnus écartés', () => {
    expect(
      transformPreferences(
        user({ dice_skin: 'kyber_or', dice_inventory: ['gold', 'magma', 'licorne'] }),
      ),
    ).toEqual({
      uid: 'u1',
      skinId: 'kyber_or',
      inventory: ['magma', 'kyber_or'],
      warnings: ['Skin inconnu ignoré : licorne'],
    });
    expect(transformPreferences(user({ dice_skin: 'licorne' }))).toMatchObject({
      skinId: null,
      warnings: ['Skin choisi inconnu : licorne (skin par défaut)'],
    });
    expect(transformPreferences(user({ name: 'Sans dés' }))).toBeNull();
  });
});
