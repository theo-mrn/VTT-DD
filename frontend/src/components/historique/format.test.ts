import { describe, expect, it } from 'vitest';
import type { HistoryEvent } from '@/lib/history';
import {
  formatHistoryEvent,
  withoutRedactedTwins,
  type CharacterLabel,
  type FormatContext,
} from './format';

const characters = new Map<string, CharacterLabel>([
  ['lyra', { name: 'Lyra', avatarUrl: null, side: 'players', type: null }],
  ['orc', { name: 'Orc', avatarUrl: null, side: 'enemies', type: null }],
]);

const ctx = (viewerIsGm: boolean): FormatContext => ({
  characters,
  users: new Map(),
  maps: new Map(),
  system: null,
  viewerIsGm,
});

const event = (
  type: string,
  payload: Record<string, unknown>,
  actorCharacterId: string | null = null,
): HistoryEvent => ({
  id: `e-${type}`,
  seq: 1,
  type,
  version: 1,
  occurredAt: '2026-09-30T10:00:00Z',
  recordedAt: '2026-09-30T10:00:00Z',
  roomId: 'camp',
  actor: { userId: 'u', role: 'gm', characterId: actorCharacterId },
  aggregate: { type: 'attack', id: 'a1' },
  characterId: actorCharacterId,
  visibility: 'public',
  payload,
  correlationId: 'x',
  causationId: null,
});

const resolved = event(
  'combat.attack_resolved',
  {
    attack: {
      attackerId: 'orc',
      action: { id: 'attaque', name: 'Hache' },
      targets: [
        {
          characterId: 'lyra',
          status: 'resolved',
          result: {
            outcome: { success: true, critical: false, fumble: false },
            roll: { kind: 'numeric', total: 17 },
            modifications: [
              {
                kind: 'attribute',
                entity: 'target',
                attribute: 'hp',
                operation: 'subtract',
                value: 7,
              },
            ],
          },
        },
      ],
    },
  },
  'orc',
);

describe('chronique du combat', () => {
  it('annonce publique : qui attaque qui, et l’issue', () => {
    const line = formatHistoryEvent(
      event('combat.attack_announced', {
        attackerId: 'orc',
        action: { id: 'attaque', name: 'Hache' },
        targets: [
          { characterId: 'lyra', outcome: { success: true, critical: true, fumble: false } },
        ],
      }),
      ctx(false),
    );
    expect(line?.message).toBe('**Orc** utilise **Hache** contre **Lyra** : **critique**.');
    expect(line?.characterId).toBe('orc');
  });

  it('attaquant caché : jamais nommé, même si l’enveloppe le porte', () => {
    const line = formatHistoryEvent(
      event(
        'combat.attack_announced',
        {
          attackerId: null,
          action: { id: 'attaque', name: 'Dague' },
          targets: [
            { characterId: 'lyra', outcome: { success: false, critical: false, fumble: false } },
          ],
        },
        'orc',
      ),
      ctx(false),
    );
    expect(line?.message).toBe('Un adversaire utilise **Dague** contre **Lyra** : **raté**.');
    expect(line?.characterId).toBeUndefined();
    expect(line?.message).not.toContain('Orc');
  });

  it('conclusion : les montants donnés par le serveur', () => {
    const line = formatHistoryEvent(
      event('combat.attack_concluded', {
        attackerId: 'orc',
        targets: [
          { characterId: 'lyra', decision: 'applied', amounts: [{ attribute: 'hp', value: 7 }] },
        ],
      }),
      ctx(false),
    );
    expect(line?.message).toBe('Attaque de **Orc** appliquée : **Lyra** (7 hp).');
  });

  it('rapport complet et décision : MJ seulement', () => {
    expect(formatHistoryEvent(resolved, ctx(true))?.message).toBe(
      '**Orc** utilise **Hache** : **Lyra** : **touché**, jet 17, −7 hp.',
    );
    for (const e of [
      resolved,
      event('combat.attack_decided', { targets: [] }, 'orc'),
      event('combat.attack_reverted', { targetIds: ['lyra'] }, 'orc'),
      event('combat.participant_defeated', { characterId: 'orc' }),
    ])
      expect(formatHistoryEvent(e, ctx(false))).toBeNull();
  });

  it('décision du MJ, annulation, hors de combat', () => {
    const decided = formatHistoryEvent(
      event(
        'combat.attack_decided',
        {
          targets: [
            {
              characterId: 'lyra',
              decision: 'applied',
              applied: {
                modifications: [
                  { kind: 'attribute', attribute: 'hp', operation: 'subtract', value: 3 },
                ],
                tables: [],
                redirectedTo: null,
              },
            },
          ],
          note: 'Moitié',
        },
        'orc',
      ),
      ctx(true),
    );
    expect(decided?.message).toBe(
      'Le MJ applique l’attaque de **Orc** : **Lyra** : −3 hp. « Moitié »',
    );
    expect(
      formatHistoryEvent(
        event('combat.attack_reverted', { targetIds: ['lyra'], forced: true, actor: false }, 'orc'),
        ctx(true),
      )?.message,
    ).toBe('Application annulée (forcée) : attaque de **Orc** sur **Lyra**.');
    const defeated = formatHistoryEvent(
      event('combat.participant_defeated', { characterId: 'orc' }),
      ctx(true),
    );
    expect(defeated?.type).toBe('mort');
    expect(defeated?.message).toBe('**Orc** est hors de combat !');
  });

  it('tours en double (complet au MJ, expurgé pour tous, même version) : le MJ garde le complet', () => {
    const turn = (visibility: HistoryEvent['visibility'], version: number, extra = {}) => ({
      ...event('combat.turn_changed', { reason: 'turn_set', version, ...extra }),
      id: `t-${visibility}-${version}`,
      aggregate: { type: 'combat', id: 'c1' },
      visibility,
    });
    const full = turn('gm_only', 4, { currentActorId: 'orc' });
    const redacted = turn('public', 4, { currentActorId: null });
    const alone = turn('public', 5, { currentActorId: 'lyra' });
    expect(withoutRedactedTwins([full, redacted, alone]).map((e) => e.id)).toEqual([
      full.id,
      alone.id,
    ]);
    // Un joueur ne reçoit que les publics : rien n'est retiré
    expect(withoutRedactedTwins([redacted, alone])).toEqual([redacted, alone]);
    expect(formatHistoryEvent(full, ctx(true))?.message).toBe('Le MJ donne la main à **Orc**.');
  });

  it('tours : retour arrière, main donnée ; le signal attack_updated ne se raconte pas', () => {
    expect(
      formatHistoryEvent(event('combat.turn_changed', { reason: 'previous', round: 2 }), ctx(false))
        ?.message,
    ).toBe('Retour au tour précédent (round **2**).');
    expect(
      formatHistoryEvent(
        event('combat.turn_changed', { reason: 'turn_set', currentActorId: 'lyra' }),
        ctx(false),
      )?.message,
    ).toBe('Le MJ donne la main à **Lyra**.');
    expect(
      formatHistoryEvent(event('combat.attack_updated', { attackId: 'a1' }), ctx(true)),
    ).toBeNull();
  });

  it('fiche modifiée par le combat : application, annulation, durées rendues', () => {
    const updated = (payload: Record<string, unknown>) => ({
      ...event('character.updated', payload),
      aggregate: { type: 'character', id: 'lyra' },
    });
    const applied = formatHistoryEvent(
      updated({
        operation: 'combat.application',
        applicationId: 'app-1',
        changes: [
          { path: 'etat.valeurs.PV', before: 12, after: 8 },
          { path: 'etat.possessions[etourdi]', after: { entree: 'etourdi', duree: 2 } },
        ],
      }),
      ctx(true),
    );
    expect(applied).toMatchObject({ type: 'combat', characterId: 'lyra' });
    expect(applied?.message).toBe(
      '**Lyra** : PV passe de 12 à **8**. **Lyra** est **etourdi** (2 rounds).',
    );

    const reverted = formatHistoryEvent(
      updated({
        operation: 'combat.annulation',
        applicationId: 'app-1',
        forced: true,
        changes: [
          { path: 'etat.valeurs.PV', before: 8, after: 12 },
          { path: 'etat.possessions[etourdi]', before: { entree: 'etourdi', duree: 2 } },
        ],
      }),
      ctx(true),
    );
    expect(reverted?.message).toBe(
      "Annulation du MJ (forcée) : **Lyra** : PV passe de 8 à **12**. **Lyra** n'est plus **etourdi**.",
    );

    const round = formatHistoryEvent(
      updated({
        operation: 'combat.annulation',
        applicationId: 'tick:c1:1:t1',
        changes: [{ path: 'etat.possessions[aveugle]', after: { entree: 'aveugle', duree: 1 } }],
      }),
      ctx(true),
    );
    expect(round?.message).toBe('Retour au tour précédent : **Lyra** est **aveugle** (1 round).');
  });
});
