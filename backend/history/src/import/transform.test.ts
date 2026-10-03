import { describe, expect, it } from 'vitest';
import { prepareEvent, type Mappings } from './loading.js';
import { isEventPath, legacyType, snakeCase, transformEvent, uuidv5 } from './transform.js';

const doc = (data: Record<string, unknown>, path = 'Historique/123456/events/ev1') => ({
  path,
  id: path.split('/').pop()!,
  data,
});

describe('uuidv5', () => {
  it('vecteur de la RFC 9562 (espace DNS, www.example.com)', () => {
    expect(uuidv5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('stable pour un même chemin, différent sinon', () => {
    const a = transformEvent(doc({ timestamp: 1 }));
    expect(transformEvent(doc({ timestamp: 2 })).id).toBe(a.id);
    expect(transformEvent(doc({ timestamp: 1 }, 'Historique/123456/events/ev2')).id).not.toBe(a.id);
  });
});

describe('types', () => {
  it('legacy.<type en snake_case>', () => {
    expect(legacyType('combat')).toBe('legacy.combat');
    expect(legacyType('levelUp')).toBe('legacy.level_up');
    expect(legacyType('Compétence spéciale')).toBe('legacy.competence_speciale');
    expect(legacyType('')).toBe('legacy.unknown');
    expect(legacyType(42)).toBe('legacy.unknown');
    expect(snakeCase('12-abc')).toBe('abc');
  });
});

describe('transformEvent', () => {
  it('reprend le message, le personnage et les détails ; garde les champs inconnus', () => {
    const e = transformEvent(
      doc({
        type: 'inventaire',
        message: '**Aria** a ramassé une épée',
        characterId: 'perso1',
        characterName: 'Aria',
        characterAvatar: 'https://exemple/a.png',
        characterType: 'joueurs',
        details: { item: 'épée', hiddenFromTimeline: true },
        timestamp: { $timestamp: '2025-03-14T20:15:00.123456789Z' },
        couleur: 'rouge',
      }),
    );
    expect(isEventPath('Historique/123456/events/ev1')).toBe(true);
    expect(isEventPath('Historique/123456/summaries/2025-03-14')).toBe(false);
    expect(e).toMatchObject({
      legacyId: 'Historique/123456/events/ev1',
      campaignCode: '123456',
      type: 'legacy.inventaire',
      characterLegacyId: 'perso1',
      warnings: [],
      payload: {
        message: '**Aria** a ramassé une épée',
        character: {
          legacyId: 'perso1',
          name: 'Aria',
          avatar: 'https://exemple/a.png',
          type: 'joueurs',
        },
        details: { item: 'épée', hiddenFromTimeline: true },
        extra: { couleur: 'rouge' },
        legacy: { source: 'firebase', path: 'Historique/123456/events/ev1', type: 'inventaire' },
      },
    });
    expect(e.occurredAt.toISOString()).toBe('2025-03-14T20:15:00.123Z');
    expect(e.targetUid).toBeUndefined();
  });

  it('avatar intégré (data:) retiré, URL gardée', () => {
    const e = transformEvent(
      doc({
        type: 'combat',
        message: 'x',
        characterName: 'Aria',
        characterAvatar: 'data:image/png;base64,AAAA',
        timestamp: 1,
      }),
    );
    expect(e.payload.character).toMatchObject({ name: 'Aria', avatar: null });
    expect(e.warnings).toEqual(['avatar intégré retiré']);
  });

  it('sans date : refusé ; type inconnu et message absent : signalés', () => {
    expect(() => transformEvent(doc({ type: 'note', message: 'x' }))).toThrow(/date/);
    const e = transformEvent(doc({ type: 'bizarre', timestamp: 1_700_000_000_000 }));
    expect(e.warnings).toEqual(['type inconnu', 'message absent']);
    expect(e.type).toBe('legacy.bizarre');
  });
});

describe('prepareEvent', () => {
  const campaignId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const characterId = crypto.randomUUID();
  const maps: Mappings = {
    accounts: new Map([['uid-1', userId]]),
    campaigns: new Map([['123456', campaignId]]),
    characters: new Map([['cartes/123456/characters/perso1', characterId]]),
    roles: new Map([[`${campaignId}:${userId}`, 'gm']]),
  };

  it('note privée : visible de son auteur (compte migré) et du MJ', () => {
    const p = prepareEvent(
      transformEvent(
        doc({ type: 'note', message: 'x', targetUserId: 'uid-1', timestamp: 1_700_000_000_000 }),
      ),
      maps,
    );
    expect(p).toMatchObject({
      status: 'ready',
      ownerFound: true,
      envelope: {
        roomId: campaignId,
        visibility: 'owner',
        actor: { userId, role: 'gm', characterId: null },
        aggregate: { type: 'campaign', id: campaignId },
        correlationId: 'import:firebase:historique',
      },
    });
  });

  it('personnage retrouvé : agrégat personnage ; campagne non importée : écarté', () => {
    const e = transformEvent(doc({ type: 'combat', characterId: 'perso1', timestamp: 1 }));
    expect(prepareEvent(e, maps)).toMatchObject({
      characterFound: true,
      envelope: {
        visibility: 'public',
        actor: { userId: null, role: 'system' },
        aggregate: { type: 'character', id: characterId },
      },
    });
    const unknown = transformEvent(
      doc({ type: 'combat', timestamp: 1 }, 'Historique/999/events/a'),
    );
    expect(prepareEvent(unknown, maps)).toEqual({ status: 'no-campaign' });
  });
});
