import { buildRoomExportBundle, parseRoomExportBundle, downloadRoomExportBundle, type RoomExportBundleSource } from '../transfer';
import type { StatDefinition } from '@/modules/game-system/types';
import type { CharacterExportData } from '@/utils/characterTransfer';
import type { ContentDoc, SpecializationDoc } from '@/modules/game-content/types';

function statDef(key: string): StatDefinition {
  return { key, label: key, category: 'ability', dataType: 'number', origin: 'module' };
}

const gameSystemSource = { name: 'Mon système', description: 'desc', stats: [statDef('FOR')] };
const groupEntities = { entityLabel: 'Vaisseau', entities: [{ label: 'Faucon', values: { Vitesse: 5 } }] };
const characters: CharacterExportData[] = [
  {
    exportVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    character: { Nomperso: 'Han' } as unknown as CharacterExportData['character'],
    customCompetences: [],
    inventory: [],
    bonuses: [],
  },
];
const content: ContentDoc[] = [
  { kind: 'equipment', name: 'armes', category: 'armes', items: [{ nom: 'Pistolet blaster', prix: '400' }] },
];

// Vérification bout-en-bout Phase 8 : un système EotE-like complet (skills + diceUpgradeRule +
// spécialisation avec grille de talents) + un personnage ayant progressé (career/skillRanks/xp/
// unlockedTalents) survit à l'aller-retour export -> JSON -> import.
const eoteGameSystemSource = {
  name: 'Système narratif',
  description: 'desc',
  stats: [statDef('Agilite')],
  skills: [{ key: 'discretion', label: 'Discrétion', linkedStatKey: 'Agilite' }],
  skillLabel: 'Compétences',
  startingXp: 110,
  diceUpgradeRule: { baseDiceKey: 'ability', upgradedDiceKey: 'proficiency' },
  profiles: [{ id: 'contrebandier', label: 'Contrebandier', careerSkillKeys: ['discretion'] }],
};
const specializationDoc: SpecializationDoc = {
  kind: 'specialization',
  name: 'Pilote',
  careerIds: ['contrebandier'],
  grantedSkillKeys: ['discretion'],
  talents: [
    { id: 't1', x: 0, y: 0, title: 'Sang-froid', xpCost: 5, prerequisiteIds: [] },
    { id: 't2', x: 1, y: 0, title: 'Réflexes', xpCost: 10, prerequisiteIds: ['t1'], maxRank: 3 },
  ],
};
const eoteCharacters: CharacterExportData[] = [
  {
    exportVersion: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    character: {
      Nomperso: 'Han',
      Profile: 'contrebandier',
      career: 'contrebandier',
      careerSkillChoices: ['discretion'],
      specializations: ['spec-pilote'],
      specializationSkillChoices: { 'spec-pilote': ['discretion'] },
      skillRanks: { discretion: 2 },
      xp: 85,
      xpSpent: 25,
      unlockedTalents: { 'spec-pilote': { t1: 1 } },
    } as unknown as CharacterExportData['character'],
    customCompetences: [],
    inventory: [],
    bonuses: [],
  },
];

describe('buildRoomExportBundle / parseRoomExportBundle — round-trip', () => {
  test('aucune section fournie => seules exportVersion/exportedAt sont présentes', () => {
    const bundle = buildRoomExportBundle({});
    expect(bundle.exportVersion).toBe(1);
    expect(typeof bundle.exportedAt).toBe('string');
    expect('gameSystem' in bundle).toBe(false);
    expect('groupEntities' in bundle).toBe(false);
    expect('characters' in bundle).toBe(false);
  });

  test('une seule section (gameSystem) => les autres sont absentes', () => {
    const bundle = buildRoomExportBundle({ gameSystem: gameSystemSource });
    expect(bundle.gameSystem?.name).toBe('Mon système');
    expect('groupEntities' in bundle).toBe(false);
    expect('characters' in bundle).toBe(false);
  });

  test('les 4 sections cochées (dont content) => round-trip build -> stringify -> parse fidèle', () => {
    const source: RoomExportBundleSource = { gameSystem: gameSystemSource, groupEntities, characters, content };
    const bundle = buildRoomExportBundle(source);
    const raw = JSON.stringify(bundle);
    const parsed = parseRoomExportBundle(raw);

    expect(parsed.gameSystem?.name).toBe('Mon système');
    expect(parsed.gameSystem?.stats).toEqual(gameSystemSource.stats);
    expect(parsed.groupEntities).toEqual(groupEntities);
    expect(parsed.characters).toEqual(characters);
    expect(parsed.content).toEqual(content);
  });

  test('Phase 8 bout-en-bout : système EotE-like (skills/diceUpgradeRule/careerSkillKeys) + '
    + 'spécialisation avec grille de talents + personnage ayant progressé (career/skillRanks/xp/'
    + 'unlockedTalents) survivent tous à l\'aller-retour export -> JSON -> import', () => {
    const source: RoomExportBundleSource = {
      gameSystem: eoteGameSystemSource,
      characters: eoteCharacters,
      content: [specializationDoc],
    };
    const bundle = buildRoomExportBundle(source);
    const raw = JSON.stringify(bundle);
    const parsed = parseRoomExportBundle(raw);

    expect(parsed.gameSystem?.skills).toEqual(eoteGameSystemSource.skills);
    expect(parsed.gameSystem?.skillLabel).toBe('Compétences');
    expect(parsed.gameSystem?.startingXp).toBe(110);
    expect(parsed.gameSystem?.diceUpgradeRule).toEqual(eoteGameSystemSource.diceUpgradeRule);
    expect(parsed.gameSystem?.profiles[0].careerSkillKeys).toEqual(['discretion']);

    expect(parsed.content).toEqual([specializationDoc]);
    const parsedSpec = parsed.content?.[0] as SpecializationDoc;
    expect(parsedSpec.talents).toEqual(specializationDoc.talents);

    const parsedCharacter = parsed.characters?.[0].character as unknown as Record<string, unknown>;
    expect(parsedCharacter.career).toBe('contrebandier');
    expect(parsedCharacter.skillRanks).toEqual({ discretion: 2 });
    expect(parsedCharacter.xp).toBe(85);
    expect(parsedCharacter.unlockedTalents).toEqual({ 'spec-pilote': { t1: 1 } });
  });

  test('ignore un doc de content malformé (kind inconnu ou name manquant) plutôt que de planter', () => {
    const raw = JSON.stringify({
      exportVersion: 1,
      exportedAt: 'x',
      content: [{ kind: 'equipment', name: 'valide', category: 'armes', items: [] }, { kind: 'inconnu', name: 'x' }, { name: 'sans kind' }],
    });
    const parsed = parseRoomExportBundle(raw);
    expect(parsed.content).toHaveLength(1);
    expect(parsed.content?.[0]).toMatchObject({ kind: 'equipment', name: 'valide' });
  });

  test('content absent du bundle => clé absente au parse (pas de tableau vide implicite)', () => {
    const bundle = buildRoomExportBundle({ gameSystem: gameSystemSource });
    const parsed = parseRoomExportBundle(JSON.stringify(bundle));
    expect('content' in parsed).toBe(false);
  });

  test('rétrocompat : un bundle sans une section donnée reste sans cette section au parse (pas de clé undefined)', () => {
    const bundle = buildRoomExportBundle({ groupEntities });
    const parsed = parseRoomExportBundle(JSON.stringify(bundle));
    expect('gameSystem' in parsed).toBe(false);
    expect('characters' in parsed).toBe(false);
    expect(parsed.groupEntities).toEqual(groupEntities);
  });

  test('rejette un texte qui n\'est pas du JSON valide', () => {
    expect(() => parseRoomExportBundle('pas du json')).toThrow();
  });

  test('BUG RÉEL corrigé : un fichier export système SEUL (pas enveloppé dans un bundle, stats à la '
    + 'racine) est accepté comme section gameSystem plutôt que rejeté — piège si l\'utilisateur dépose '
    + 'un fichier du panneau Règles du jeu dans ce panneau', () => {
    const soloGameSystem = { exportVersion: 1, exportedAt: 'x', name: 'Sys', description: '', stats: [statDef('FOR')] };
    const parsed = parseRoomExportBundle(JSON.stringify(soloGameSystem));
    expect(parsed.gameSystem?.name).toBe('Sys');
    expect('groupEntities' in parsed).toBe(false);
    expect('characters' in parsed).toBe(false);
  });

  test('rejette un JSON qui n\'est pas un objet', () => {
    expect(() => parseRoomExportBundle(JSON.stringify([1, 2, 3]))).toThrow();
  });

  test('ignore une section groupEntities malformée plutôt que de planter', () => {
    const raw = JSON.stringify({ exportVersion: 1, exportedAt: 'x', groupEntities: { entities: 'pas un tableau' } });
    const parsed = parseRoomExportBundle(raw);
    expect('groupEntities' in parsed).toBe(false);
  });

  test('ignore une section characters malformée plutôt que de planter', () => {
    const raw = JSON.stringify({ exportVersion: 1, exportedAt: 'x', characters: [{ foo: 'bar' }] });
    const parsed = parseRoomExportBundle(raw);
    expect('characters' in parsed).toBe(false);
  });
});

describe('downloadRoomExportBundle', () => {
  test('déclenche un téléchargement via un lien blob (smoke test)', () => {
    const createObjectURL = jest.fn(() => 'blob:mock');
    const revokeObjectURL = jest.fn();
    (global as unknown as { URL: unknown }).URL = { ...URL, createObjectURL, revokeObjectURL };
    const clickSpy = jest.fn();
    const original = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = original(tag);
      if (tag === 'a') el.click = clickSpy;
      return el;
    });

    downloadRoomExportBundle(buildRoomExportBundle({ gameSystem: gameSystemSource }), 'test.json');

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    jest.restoreAllMocks();
  });
});
