/**
 * Décor commun des tests d'intégration des attaques : une campagne D&D, un MJ, deux joueurs
 * qui incarnent chacun leur héros, un gobelin (PNJ visible sur la carte) et une ombre (PNJ
 * invisible, que les joueurs ne connaissent pas).
 */
import { sql } from 'drizzle-orm';
import { outbox } from '../db/schema.js';
import { helpers, type TestContext, type TestUser } from './test-app.js';

export interface Envelope {
  type: string;
  visibility: string;
  actor: { userId: string | null; characterId: string | null };
  payload: Record<string, unknown>;
}

/** Valeurs de PNJ qui ne doivent jamais atteindre un joueur. */
export const NPC_SECRETS = ['defenseCible', 'Défense de la cible', 'Stress'];

export async function attackScene(t: TestContext) {
  const h = helpers(t);
  const gm = await t.user();
  const alice = await t.user();
  const bob = await t.user();
  const id = await h.campaign(gm, 'dnd-classic', [alice, bob]);
  const aria = await h.engage(id, alice, {
    name: 'Aria',
    sortKeys: [18],
    values: { PV: 20, Defense: 12, Stress: 0 },
  });
  const brom = await h.engage(id, bob, {
    name: 'Brom',
    sortKeys: [5],
    values: { PV: 18, Defense: 11, Stress: 0 },
  });
  const goblin = await h.engage(id, gm, {
    name: 'Gobelin',
    sortKeys: [10],
    values: { PV: 7, Defense: 17, Stress: 0 },
    defeatedWhen: (v) => (v.PV ?? 0) <= 0,
  });
  const shadow = await h.engage(id, gm, {
    name: 'Ombre',
    sortKeys: [1],
    values: { PV: 30, Defense: 15, Stress: 0 },
  });
  await h.play(id, alice, aria);
  await h.play(id, bob, brom);
  const map = await h.ok<{ id: string }>(gm, 'POST', `/v1/campaigns/${id}/maps`, {
    name: 'Clairière',
    width: 1000,
    height: 1000,
  });
  const token = (characterId: string, x: number, visibility?: string) =>
    h.ok(gm, 'POST', `/v1/campaigns/${id}/maps/${map.id}/tokens`, {
      characterId,
      pos: { x, y: 300 },
      ...(visibility ? { visibility } : {}),
    });
  await token(aria, 100);
  await token(brom, 200);
  await token(goblin, 400);
  await token(shadow, 600, 'invisible');

  const attacks = `/v1/campaigns/${id}/attacks`;
  const combat = `/v1/campaigns/${id}/combat`;

  /** Événements des attaques (et du combat) de la campagne, dans l'ordre. */
  const events = async (prefix = 'combat.attack_') =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${id}`)
        .orderBy(outbox.id)
    )
      .map((e) => e.envelope as Envelope)
      .filter((e) => e.type.startsWith(prefix));

  /** Événements qu'un joueur reçoit en entier : publics, ou `gm_only` qui le listent. */
  const receivedBy = async (u: TestUser) =>
    (await events('combat.')).filter(
      (e) =>
        e.visibility === 'public' ||
        (e.visibility === 'gm_only' &&
          ((e.payload.visibleToUsers as string[] | undefined) ?? []).includes(u.id)),
    );

  const callsTo = (path: string) => t.character.calls.filter((c) => c.path === path);

  return {
    h,
    gm,
    alice,
    bob,
    id,
    aria,
    brom,
    goblin,
    shadow,
    attacks,
    combat,
    events,
    receivedBy,
    callsTo,
  };
}

/** Rien de secret dans ce que reçoit un joueur. */
export function leaks(payload: unknown): string[] {
  const text = JSON.stringify(payload);
  return NPC_SECRETS.filter((s) => text.includes(s));
}
