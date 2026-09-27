import { uuidv7, type EventEnvelope } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { catalogue } from './catalogue.js';
import {
  BLESSED_SLUG,
  COUNTER_TITLES,
  CURSED_SLUG,
  reachedTitles,
  titleEffects,
} from './event-rules.js';

const USER = '0192a000-0000-7000-8000-000000000001';
const CAMPAIGN = '0192a000-0000-7000-8000-0000000000c1';

function envelope(
  type: string,
  payload: Record<string, unknown>,
  roomId: string | null = CAMPAIGN,
) {
  return {
    id: uuidv7(),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    roomId,
    actor: { userId: USER, role: 'player', characterId: null },
    aggregate: { type: 'roll', id: uuidv7() },
    visibility: 'public',
    payload,
    correlationId: 'test',
    causationId: null,
    traceparent: null,
  } satisfies EventEnvelope;
}

/** dice.rolled avec des groupes `[faces, valeurs]`. */
const rolled = (groups: [number, number[]][], extra: Record<string, unknown> = {}) =>
  envelope('dice.rolled', {
    authorId: USER,
    source: '3d',
    dice: groups.map(([faces, values]) => ({
      faces,
      values: values.map((value) => ({ value, kept: true, exploded: false })),
    })),
    ...extra,
  });

describe('règles des titres « événement »', () => {
  it('ne vise que des titres « événement » du catalogue', () => {
    const parSlug = new Map(catalogue().map((t) => [t.slug, t]));
    for (const slug of [...COUNTER_TITLES.map((t) => t.slug), CURSED_SLUG, BLESSED_SLUG]) {
      expect(parSlug.get(slug)?.condition, slug).toMatchObject({ type: 'event' });
    }
    expect(CURSED_SLUG).toBe('maudit-des-des');
    expect(BLESSED_SLUG).toBe('beni-des-dieux');
  });

  it('compte un jet pour 1, quel que soit le nombre de dés', () => {
    expect(titleEffects(rolled([[6, [3, 4, 5]]]))).toEqual({
      userId: USER,
      increments: { dice_rolls: 1 },
      unlocks: [],
    });
  });

  it('1 naturel sur le premier d20 : échec critique et « Maudit des dés »', () => {
    expect(titleEffects(rolled([[20, [1]]]))).toEqual({
      userId: USER,
      increments: { dice_rolls: 1, critical_fails: 1 },
      unlocks: [CURSED_SLUG],
    });
  });

  it('20 naturel sur le premier d20 : réussite critique et « Béni des Dieux »', () => {
    expect(titleEffects(rolled([[20, [20]]]))).toMatchObject({
      increments: { dice_rolls: 1, critical_successes: 1 },
      unlocks: [BLESSED_SLUG],
    });
  });

  it('critique : seulement le premier dé du premier groupe ; titres : n’importe quel d20', () => {
    // Comme trackDiceRoll : le premier dé n'est pas un 20, pas de critique compté
    expect(titleEffects(rolled([[20, [7, 20, 1]]]))).toMatchObject({
      increments: { dice_rolls: 1 },
      unlocks: [CURSED_SLUG, BLESSED_SLUG],
    });
    // Premier groupe en d6 : pas de critique, mais le d20 suivant débloque
    expect(
      titleEffects(
        rolled([
          [6, [1]],
          [20, [20]],
        ]),
      ),
    ).toMatchObject({
      increments: { dice_rolls: 1 },
      unlocks: [BLESSED_SLUG],
    });
    // Un 1 ou un 20 sur un autre dé ne compte pas
    expect(titleEffects(rolled([[100, [1, 20]]]))!.unlocks).toEqual([]);
  });

  it('jet à symboles (sans groupe numérique) : compté, jamais critique', () => {
    expect(titleEffects(rolled([], { symbols: { dice: [{ die: 'boost', face: 1 }] } }))).toEqual({
      userId: USER,
      increments: { dice_rolls: 1 },
      unlocks: [],
    });
  });

  it('seuls les vrais jets dans une campagne comptent', () => {
    for (const source of ['3d', 'mixed', 'free', 'action']) {
      expect(titleEffects(rolled([[20, [1]]], { source })), source).not.toBeNull();
    }
    for (const source of ['import', 'api', 'inconnue']) {
      expect(titleEffects(rolled([[20, [1]]], { source })), source).toBeNull();
    }
    // Jet personnel (hors campagne) : l'ancienne app ne le suivait pas
    const perso = rolled([[20, [20]]]);
    expect(titleEffects({ ...perso, roomId: null })).toBeNull();
    // Jet caché au MJ : compté, comme dans l'ancienne app
    expect(titleEffects(rolled([[20, [1]]], { visibility: 'gm' }))).not.toBeNull();
  });

  it('ignore les charges illisibles et les jets sans auteur', () => {
    expect(titleEffects(envelope('dice.rolled', { source: '3d', dice: 'nope' }))).toBeNull();
    expect(titleEffects(envelope('dice.rolled', { dice: [] }))).toBeNull();
    const sansAuteur = rolled([[20, [1]]], { authorId: null });
    expect(
      titleEffects({ ...sansAuteur, actor: { ...sansAuteur.actor, userId: null } }),
    ).toBeNull();
  });

  it('compte les messages de campagne', () => {
    expect(
      titleEffects(
        envelope('campaign.message_posted', { id: uuidv7(), authorId: USER, body: 'x' }),
      ),
    ).toEqual({ userId: USER, increments: { chat_messages: 1 }, unlocks: [] });
    expect(titleEffects(envelope('campaign.message_deleted', { authorId: USER }))).toBeNull();
    expect(titleEffects(envelope('dice.roll_deleted', { authorId: USER }))).toBeNull();
  });

  it('paliers des défis de l’ancienne app', () => {
    expect(reachedTitles({ dice_rolls: 1 })).toEqual(['apprenti-lanceur']);
    expect(reachedTitles({ dice_rolls: 49 })).toEqual(['apprenti-lanceur']);
    expect(reachedTitles({ dice_rolls: 50 })).toEqual(['apprenti-lanceur', 'lanceur-enthousiaste']);
    expect(reachedTitles({ critical_successes: 1 })).toEqual(['chanceux']);
    expect(reachedTitles({ critical_fails: 9 })).toEqual([]);
    expect(reachedTitles({ critical_fails: 10 })).toEqual(['eternel-malchanceux']);
    expect(reachedTitles({ chat_messages: 50 })).toEqual(['orateur-novice', 'conteur-bavard']);
    expect(reachedTitles({ chat_messages: 200 })).toEqual([
      'orateur-novice',
      'conteur-bavard',
      'barde-legendaire',
    ]);
  });
});
