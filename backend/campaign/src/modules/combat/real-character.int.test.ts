/**
 * Combat de bout en bout contre le VRAI service character (docs/combat.md, étapes A et B) :
 * campaign et character tournent ensemble (`realCombatApp`), sur la base Docker de dev.
 *
 * D&D : démarrer (PNJ du bestiaire posés sur la carte, dont un caché), initiative, suivant et
 * précédent (durées décomptées puis rendues), attaque d'un joueur à une cible, attaque de zone
 * du MJ en jet commun, décisions (appliquer, modifier, écarter), hors de combat, annulation
 * (et son conflit 409, puis forcée), fin de combat qui retire les états à durée.
 * Star Wars : mode créneaux, attaque d'un PNJ, Esquive choisie par le joueur de la cible.
 * Situation (§ 5.7) : l'abri de la cible et l'avantage de situation changent l'issue (D&D) ;
 * participant surpris, décompte des attaques, Frappe rapide d'office contre la cible qui n'a
 * pas encore agi, par le contexte `@combat.*` que campaign fige et envoie (Star Wars).
 * Attaque en étapes (§ 6) : le d20 (TOUCHÉ vu du joueur), puis les dégâts des seules cibles
 * touchées, raté sans étape de dégâts, étape périmée (409), reprise par le MJ ; Star Wars en
 * une étape.
 *
 * Non-fuite, de bout en bout : un joueur ne reçoit aucune valeur d'un PNJ (REST, événements de
 * campaign et de character, jets transmis à l'historique des dés), ni la fiche d'un PNJ ennemi
 * (Q4) ; les attaques du MJ sont cachées par défaut.
 */
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  CHARACTER_TEST_DATABASE_URL,
  realCombatApp,
  TEST_DATABASE_URL,
  type RealCombat,
  type RealUser,
} from '../../test/real-character.js';

interface Envelope {
  type: string;
  visibility: string;
  actor: { userId: string | null; characterId: string | null };
  aggregate: { type: string; id: string };
  payload: Record<string, unknown>;
}

interface Sheet {
  id: string;
  version: number;
  etat: {
    valeurs: Record<string, unknown>;
    possessions: { entree: string; duree?: number }[];
  };
  fiche: { valeurs: Record<string, { valeur: unknown }> };
}

interface Participant {
  characterId: string;
  side: string;
  sortKeys: number[];
  hasActed: boolean;
  visibleToPlayers?: boolean;
  initiative?: { summary: string } | null;
  defeated?: boolean;
}
interface Combat {
  id: string;
  round: number;
  mode: string;
  order: Participant[];
  currentIndex: number;
  slots?: { side: string }[];
  version: number;
  currentActorId?: string | null;
  canGoBack?: boolean;
  redacted?: boolean;
  durationUpdates?: { characterId: string; expired: string[] }[];
  durationFailures?: string[];
}

interface Target {
  characterId: string;
  status: string;
  decision: string;
  reactionParams?: string[];
  view?: {
    outcome: { success: boolean };
    roll: { kind: string; dice?: { faces: number; values: { value: number }[] }[] };
    values: { key: string; value: unknown }[];
    explanations: string[];
  } | null;
  result?: {
    outcome: { success: boolean };
    roll: { kind: string; dice?: { faces: number; values: { value: number }[] }[] };
    modifications: { kind: string; attribute?: string; operation?: string; value?: number }[];
  } | null;
  applied?: { applicationId: string; defeated: boolean } | null;
}
interface Step {
  id: string;
  phase: string;
  label?: string;
  dice: { id: string; targetId: string | null; faces: number; die?: string }[];
}
interface Attack {
  id: string;
  attackerId: string;
  pendingSteps: Step[];
  action: { id: string; name: string };
  rollMode: string;
  visibility: string;
  status: string;
  outOfTurn: boolean;
  targets: Target[];
  actor?: unknown;
  version: number;
  redacted: boolean;
}

/** 20 naturel : critique, touche toujours (quelle que soit la fiche tirée à la création). */
const CRIT = 20;

describe.skipIf(!TEST_DATABASE_URL || !CHARACTER_TEST_DATABASE_URL)(
  'combat contre le vrai character',
  () => {
    let t: RealCombat;
    beforeAll(async () => {
      t = await realCombatApp();
    });
    afterAll(async () => {
      await t?.close();
    });

    // ─── Outils ──────────────────────────────────────────────────────────────

    type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    const ok = async <T = Record<string, unknown>>(
      u: RealUser,
      method: Method,
      url: string,
      body?: unknown,
    ): Promise<T> => {
      const res = await t.toCampaign(u, method, url, body);
      if (res.statusCode >= 300)
        throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
      return (res.body ? res.json() : undefined) as T;
    };
    const okSheet = async (u: RealUser, method: Method, url: string, body?: unknown) => {
      const res = await t.toCharacter(u, method, url, body);
      if (res.statusCode >= 300)
        throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
      return res.json() as Sheet;
    };
    const sheet = (u: RealUser, id: string) => okSheet(u, 'GET', `/v1/characters/${id}`);

    /**
     * Lance les étapes de dés d'une attaque une à une, dés tirés par character (`results: []`),
     * jusqu'au rapport : le jet, puis les dégâts des cibles touchées, puis la table.
     */
    async function rollSteps<T extends Attack>(u: RealUser, campaignId: string, a: T): Promise<T> {
      let current = a;
      for (let i = 0; i < 10 && current.pendingSteps.length; i++)
        current = await ok<T>(u, 'POST', `/v1/campaigns/${campaignId}/attacks/${current.id}/dice`, {
          stepId: current.pendingSteps[0]!.id,
          results: [],
        });
      return current;
    }
    const value = async (u: RealUser, id: string, key: string) =>
      Number((await sheet(u, id)).fiche.valeurs[key]?.valeur);

    /** Guerrier nain D&D terminé (création complète par la vraie fiche). */
    async function dwarf(u: RealUser, nom: string) {
      let p = await okSheet(u, 'POST', '/v1/characters', {
        systemeId: 'dnd-classic',
        type: 'personnage',
        nom,
      });
      for (const [step, body] of [
        ['race', { entrees: [{ entree: 'nain' }] }],
        ['profil', { entrees: [{ entree: 'guerrier' }] }],
        ['voies', { entrees: [{ entree: 'guerrier-resistance' }] }],
        ['caracteristiques', {}],
        ['de-de-vie', {}],
      ] as const)
        p = await okSheet(u, 'POST', `/v1/characters/${p.id}/creation/${step}`, {
          version: p.version,
          ...body,
        });
      return okSheet(u, 'POST', `/v1/characters/${p.id}/creation/terminer`, {
        version: p.version,
      });
    }

    /** Campagne du MJ, avec ces joueurs. */
    async function table(gm: RealUser, systemId: string, players: RealUser[]) {
      const { id } = await ok<{ id: string }>(gm, 'POST', '/v1/campaigns', {
        name: 'Table de test',
        systemId,
      });
      const { code } = await ok<{ code: string }>(
        gm,
        'POST',
        `/v1/campaigns/${id}/invitations`,
        {},
      );
      for (const p of players) await ok(p, 'POST', '/v1/campaigns/join', { code });
      const map = await ok<{ id: string }>(gm, 'POST', `/v1/campaigns/${id}/maps`, {
        name: 'Clairière',
        width: 1200,
        height: 1200,
      });
      return { id, mapId: map.id };
    }

    /** Le joueur engage son personnage, l'incarne, et le pose sur la carte. */
    async function join(
      c: { id: string; mapId: string },
      gm: RealUser,
      u: RealUser,
      characterId: string,
      x: number,
    ) {
      await ok(u, 'POST', `/v1/campaigns/${c.id}/characters`, { characterId });
      await ok(u, 'PUT', `/v1/campaigns/${c.id}/me/character`, { characterId });
      await ok(gm, 'POST', `/v1/campaigns/${c.id}/maps/${c.mapId}/tokens`, {
        characterId,
        pos: { x, y: 300 },
      });
    }

    /** PNJ posés par le MJ (vrais personnages créés par character). */
    async function npcs(
      c: { id: string; mapId: string },
      gm: RealUser,
      source: object,
      x: number,
      extra: object = {},
    ) {
      const r = await ok<{ characters: { id: string; name: string }[] }>(
        gm,
        'POST',
        `/v1/campaigns/${c.id}/maps/${c.mapId}/npcs`,
        { source, pos: { x, y: 600 }, ...extra },
      );
      return r.characters;
    }

    const campaignEvents = async (campaignId: string, prefix = 'combat.') =>
      (
        await t
          .db!.select({ envelope: outbox.envelope })
          .from(outbox)
          .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
          .orderBy(outbox.id)
      )
        .map((e) => e.envelope as Envelope)
        .filter((e) => e.type.startsWith(prefix));

    const characterEvents = async (campaignId: string) =>
      (
        await t.characterDb.query<{ envelope: Envelope }>(
          `select envelope from characters.outbox where envelope->>'roomId' = $1 order by id`,
          [campaignId],
        )
      ).rows.map((r) => r.envelope);

    /** Ce qu'un joueur reçoit en entier : public, ou `gm_only` qui le liste. */
    const receivedBy = (events: Envelope[], u: RealUser) =>
      events.filter(
        (e) =>
          e.visibility === 'public' ||
          (e.visibility === 'gm_only' &&
            ((e.payload.visibleToUsers as string[] | undefined) ?? []).includes(u.id)),
      );

    // ─── D&D ─────────────────────────────────────────────────────────────────

    describe('D&D classique', () => {
      let gm: RealUser;
      let alice: RealUser;
      let bob: RealUser;
      let c: { id: string; mapId: string };
      let thorin: string;
      let balin: string;
      let hob1: string;
      let hob2: string;
      let goblin: string;
      const combat = () => `/v1/campaigns/${c.id}/combat`;
      const attacks = () => `/v1/campaigns/${c.id}/attacks`;

      beforeAll(async () => {
        gm = await t.user('MJ');
        alice = await t.user('Alice');
        bob = await t.user('Bob');
        c = await table(gm, 'dnd-classic', [alice, bob]);
        thorin = (await dwarf(alice, 'Thorin')).id;
        balin = (await dwarf(bob, 'Balin')).id;
        await join(c, gm, alice, thorin, 100);
        await join(c, gm, bob, balin, 200);
        [hob1, hob2] = (
          await npcs(c, gm, { bestiary: { systemeId: 'dnd-classic', key: 'hobgoblin' } }, 400, {
            count: 2,
          })
        ).map((n) => n.id) as [string, string];
        [goblin] = (
          await npcs(c, gm, { bestiary: { systemeId: 'dnd-classic', key: 'goblin' } }, 900, {
            visibility: 'invisible',
          })
        ).map((n) => n.id) as [string];
      });

      it('Q4 : la fiche d’un PNJ ennemi est réservée au MJ ; celle d’un héros reste lisible', async () => {
        expect((await t.toCharacter(alice, 'GET', `/v1/characters/${hob1}`)).statusCode).toBe(404);
        expect((await t.toCharacter(alice, 'GET', `/v1/characters/${goblin}`)).statusCode).toBe(
          404,
        );
        expect((await t.toCharacter(alice, 'GET', `/v1/characters/${balin}`)).statusCode).toBe(200);
        expect((await t.toCharacter(gm, 'GET', `/v1/characters/${hob1}`)).statusCode).toBe(200);
        // La liste de la campagne ne donne pas le PNJ invisible au joueur
        const list = await ok<{ characterId: string }[]>(
          alice,
          'GET',
          `/v1/campaigns/${c.id}/characters`,
        );
        expect(list.map((x) => x.characterId)).not.toContain(goblin);
      });

      it('démarre : initiative tirée par character, gobelin caché aux joueurs', async () => {
        // « Aucun combat » : 404 `no_combat`
        const none = await t.toCampaign(alice, 'GET', combat());
        expect(none.statusCode).toBe(404);
        expect(none.json()).toMatchObject({ code: 'no_combat' });

        const started = await ok<Combat>(gm, 'POST', combat(), {
          participants: [thorin, balin, hob1, hob2, goblin],
          hidden: [goblin],
          rollInitiative: true,
        });
        expect(started.mode).toBe('individual');
        expect(started.order).toHaveLength(5);
        for (const p of started.order) {
          expect(p.sortKeys).toHaveLength(1);
          expect(p.initiative?.summary).toBeTruthy();
        }
        const keys = started.order.map((p) => p.sortKeys[0]!);
        expect([...keys].sort((a, b) => b - a)).toEqual(keys);

        // Jets d'initiative dans l'historique des dés : publics pour les héros, cachés pour
        // les PNJ (leur statistique, et la présence du gobelin caché, ne fuient pas)
        const initiative = t.rolls.filter(
          (r) => r.campaignId === c.id && r.actionId === 'initiative',
        );
        expect(Object.fromEntries(initiative.map((r) => [r.characterId, r.visibility]))).toEqual({
          [thorin]: 'public',
          [balin]: 'public',
          [hob1]: 'gm',
          [hob2]: 'gm',
          [goblin]: 'gm',
        });

        const seen = await ok<Combat>(alice, 'GET', combat());
        expect(seen.redacted).toBe(true);
        expect(seen.order.map((p) => p.characterId)).not.toContain(goblin);
        for (const p of seen.order)
          if (p.side !== 'players') expect(p).toMatchObject({ sortKeys: [], initiative: null });
        expect(JSON.stringify(seen)).not.toContain(goblin);
      });

      it('suivant, fin de round (durée décomptée), précédent (durée rendue)', async () => {
        // Thorin est assourdi pour 1 round : il expire au passage du round
        let s = await sheet(alice, thorin);
        await okSheet(alice, 'POST', `/v1/characters/${thorin}/possessions`, {
          version: s.version,
          entree: 'assourdi',
          duree: 1,
        });

        let state = await ok<Combat>(gm, 'GET', combat());
        let last: Combat = state;
        for (let i = 0; i < state.order.length; i++)
          last = await ok<Combat>(gm, 'POST', `${combat()}/next`, { version: last.version });
        expect(last.round).toBe(2);
        expect(last.currentIndex).toBe(0);
        expect(last.durationFailures ?? []).toEqual([]);
        expect(last.durationUpdates?.find((u) => u.characterId === thorin)?.expired).toEqual([
          'assourdi',
        ]);
        s = await sheet(alice, thorin);
        expect(s.etat.possessions.some((p) => p.entree === 'assourdi')).toBe(false);

        // Le décompte d'un héros part aussi au joueur qui l'incarne (fiche en direct)
        const ticks = (await characterEvents(c.id)).filter(
          (e) => e.aggregate.id === thorin && e.payload.operation === 'durees.decompte',
        );
        expect(ticks.at(-1)?.payload.visibleToUsers).toEqual([alice.id]);

        // Précédent : retour au dernier tour du round 1, l'état revient avec sa durée
        const back = await ok<Combat>(gm, 'POST', `${combat()}/previous`, {
          version: last.version,
        });
        expect(back.round).toBe(1);
        expect(back.currentIndex).toBe(state.order.length - 1);
        expect(back.durationFailures ?? []).toEqual([]);
        s = await sheet(alice, thorin);
        expect(s.etat.possessions.find((p) => p.entree === 'assourdi')?.duree).toBe(1);

        // Rien à annuler au-delà du journal : on remonte jusqu'au début, puis 409
        state = back;
        while (state.canGoBack)
          state = await ok<Combat>(gm, 'POST', `${combat()}/previous`, { version: state.version });
        const res = await t.toCampaign(gm, 'POST', `${combat()}/previous`, {});
        expect(res.statusCode).toBe(409);
        expect(res.json()).toMatchObject({ code: 'nothing_to_undo' });

        // Événements des tours : jamais le gobelin caché pour un joueur
        for (const e of receivedBy(await campaignEvents(c.id), alice))
          expect(JSON.stringify(e.payload)).not.toContain(goblin);
      });

      let playerAttack: Attack;

      it('attaque d’un joueur, une cible : vue de l’attaquant seulement, jet transmis réduit', async () => {
        // Hors de son tour (réglage par défaut) : permise, marquée
        // Critique : les dés de l'arme sont doublés (1d6 → 2d6 : 3 + 1)
        t.impose(CRIT, 3, 1);
        const res = await t.toCampaign(
          alice,
          'POST',
          attacks(),
          {
            attackerId: thorin,
            action: 'attaque-libre',
            params: { score: 'Distance', nbDes: 1, faces: 6, bonus: 0 },
            targets: [hob1],
          },
          { 'idempotency-key': 'e2e-alice-attaque-1' },
        );
        expect(res.statusCode, res.body).toBe(201);
        playerAttack = await rollSteps(alice, c.id, res.json() as Attack);
        expect(playerAttack).toMatchObject({
          status: 'pending',
          visibility: 'public',
          redacted: true,
          rollMode: 'per_target',
        });
        const [target] = playerAttack.targets;
        expect(target!.view?.outcome).toMatchObject({ success: true, critical: true });
        expect(target!.view?.values).toEqual([
          expect.objectContaining({ key: 'degats', value: 4 }),
        ]);
        expect(target!.result).toBeUndefined();
        expect(playerAttack.actor).toBeUndefined();

        // Même clé : la même attaque, rien de relancé
        const again = await t.toCampaign(
          alice,
          'POST',
          attacks(),
          {
            attackerId: thorin,
            action: 'attaque-libre',
            params: { score: 'Distance', nbDes: 1, faces: 6, bonus: 0 },
            targets: [hob1],
          },
          { 'idempotency-key': 'e2e-alice-attaque-1' },
        );
        expect((again.json() as Attack).id).toBe(playerAttack.id);

        // Le MJ a le rapport complet : dégâts proposés au hobgobelin
        const full = await ok<Attack>(gm, 'GET', `${attacks()}/${playerAttack.id}`);
        expect(full.redacted).toBe(false);
        expect(full.targets[0]!.result?.modifications).toEqual([
          expect.objectContaining({ attribute: 'PV', operation: 'subtract', value: 4 }),
        ]);

        // Jet transmis à dice : un seul, public, vue de l'attaquant
        const forwarded = t.rolls.filter(
          (r) => r.campaignId === c.id && r.actionId === 'attaque-libre',
        );
        expect(forwarded).toHaveLength(1);
        expect(forwarded[0]).toMatchObject({
          authorId: alice.id,
          characterId: thorin,
          visibility: 'public',
          outcome: { success: true },
        });
        const text = JSON.stringify(forwarded[0]);
        expect(text).not.toContain('Hobgobelin');
        expect(text).not.toContain(hob1);
      });

      it('le MJ applique tel quel : PV du PNJ réduits, rien pour les joueurs', async () => {
        const before = await value(gm, hob1, 'PV');
        const applied = await ok<Attack>(gm, 'POST', `${attacks()}/${playerAttack.id}/apply`, {
          version: (await ok<Attack>(gm, 'GET', `${attacks()}/${playerAttack.id}`)).version,
          targets: [{ characterId: hob1, apply: true }],
        });
        expect(applied.status).toBe('applied');
        expect(await value(gm, hob1, 'PV')).toBe(before - 4);

        // L'auteur voit le statut, sans les montants (cible PNJ)
        const mine = await ok<Attack>(alice, 'GET', `${attacks()}/${playerAttack.id}`);
        expect(mine.status).toBe('applied');
        expect(mine.targets[0]!.decision).toBe('applied');
        expect(mine.targets[0]!.applied).toBeUndefined();

        // character.updated du PNJ : MJ seul, avec l'opération du combat
        const hobEvents = (await characterEvents(c.id)).filter((e) => e.aggregate.id === hob1);
        const last = hobEvents.at(-1)!;
        expect(last).toMatchObject({
          type: 'character.updated',
          visibility: 'gm_only',
          payload: { operation: 'combat.application' },
        });
        expect(last.payload.visibleToUsers).toEqual([]);
        // Conclusion publique : sans montant pour un PNJ
        const concluded = (await campaignEvents(c.id)).filter(
          (e) => e.type === 'combat.attack_concluded',
        );
        expect(concluded.at(-1)!.payload.targets).toEqual([
          { characterId: hob1, decision: 'applied' },
        ]);
      });

      let zone: Attack;

      it('attaque de zone du MJ en jet commun : cachée par défaut, mêmes dés pour tous', async () => {
        // Dégâts faibles : les héros tirés à la création gardent des PV
        t.impose(1, 1);
        zone = await rollSteps(
          gm,
          c.id,
          await ok<Attack>(gm, 'POST', attacks(), {
            attackerId: hob2,
            action: 'degats-libres',
            params: { nbDes: 2, faces: 2, bonus: 0 },
            targets: [thorin, balin],
          }),
        );
        expect(zone).toMatchObject({ rollMode: 'shared', visibility: 'gm', status: 'pending' });
        const dice = zone.targets.map((x) => JSON.stringify(x.result?.roll.dice));
        expect(dice[0]).toBe(dice[1]);
        for (const x of zone.targets)
          expect(x.result?.modifications).toEqual([
            expect.objectContaining({ attribute: 'PV', operation: 'subtract', value: 2 }),
          ]);

        // Un seul jet transmis à dice, caché
        const forwarded = t.rolls.filter(
          (r) => r.campaignId === c.id && r.actionId === 'degats-libres',
        );
        expect(forwarded).toHaveLength(1);
        expect(forwarded[0]!.visibility).toBe('gm');

        // Les joueurs ne voient rien de cette attaque (ni REST, ni annonce)
        for (const u of [alice, bob]) {
          expect((await t.toCampaign(u, 'GET', `${attacks()}/${zone.id}`)).statusCode).toBe(404);
          const list = await ok<{ attacks: Attack[] }>(u, 'GET', attacks());
          expect(list.attacks.map((a) => a.id)).not.toContain(zone.id);
        }
        const announced = (await campaignEvents(c.id)).filter(
          (e) => e.type === 'combat.attack_announced' && e.payload.attackId === zone.id,
        );
        expect(announced).toEqual([]);
      });

      it('décisions : modifier (moitié) pour l’un, écarter l’autre', async () => {
        const thorinBefore = await value(alice, thorin, 'PV');
        const balinBefore = await value(bob, balin, 'PV');
        zone = await ok<Attack>(gm, 'POST', `${attacks()}/${zone.id}/apply`, {
          version: zone.version,
          targets: [
            {
              characterId: thorin,
              apply: true,
              modifications: [
                { kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 1 },
              ],
            },
            { characterId: balin, apply: false },
          ],
          note: 'Moitié : test de DEX réussi',
        });
        expect(zone.status).toBe('applied');
        expect(zone.targets.map((x) => x.decision)).toEqual(['applied', 'skipped']);
        expect(await value(alice, thorin, 'PV')).toBe(thorinBefore - 1);
        expect(await value(bob, balin, 'PV')).toBe(balinBefore);

        // Le héros touché : sa fiche part au MJ et à son joueur, jamais à l'autre
        const ev = (await characterEvents(c.id)).filter(
          (e) => e.aggregate.id === thorin && e.payload.operation === 'combat.application',
        );
        expect(ev.at(-1)).toMatchObject({ visibility: 'gm_only' });
        expect(ev.at(-1)!.payload.visibleToUsers).toEqual([alice.id]);
      });

      it('annuler l’application, puis le conflit 409 quand la fiche a changé, puis forcer', async () => {
        const hp = async () => value(alice, thorin, 'PV');
        const initial = (await hp()) + 1;
        zone = await ok<Attack>(gm, 'POST', `${attacks()}/${zone.id}/revert`, {
          version: zone.version,
        });
        expect(zone.status).toBe('pending');
        expect(zone.targets[0]!.decision).toBe('reverted');
        expect(await hp()).toBe(initial);

        // Décider à nouveau (tel quel : 2), puis la fiche change entre-temps
        zone = await ok<Attack>(gm, 'POST', `${attacks()}/${zone.id}/apply`, {
          version: zone.version,
          targets: [{ characterId: thorin, apply: true }],
        });
        const applied = Math.max(0, initial - 2);
        expect(await hp()).toBe(applied);
        const changed = applied > 0 ? applied - 1 : applied + 1;
        const s = await sheet(alice, thorin);
        await okSheet(alice, 'PUT', `/v1/characters/${thorin}/valeurs`, {
          version: s.version,
          valeurs: { PV: changed },
        });
        const conflict = await t.toCampaign(gm, 'POST', `${attacks()}/${zone.id}/revert`, {
          version: zone.version,
        });
        expect(conflict.statusCode).toBe(409);
        expect(conflict.json()).toMatchObject({
          code: 'revert_conflict',
          conflicts: [{ characterId: thorin, paths: ['etat.valeurs.PV'] }],
        });
        expect(await hp()).toBe(changed);

        zone = await ok<Attack>(gm, 'POST', `${attacks()}/${zone.id}/revert`, {
          version: zone.version,
          force: true,
        });
        expect(zone.targets[0]!.decision).toBe('reverted');
        expect(await hp()).toBe(initial);
        // (le décompte rendu par « Précédent » est aussi une annulation, par son tickId)
        const reverted = (await characterEvents(c.id)).filter(
          (e) =>
            e.aggregate.id === thorin &&
            e.payload.operation === 'combat.annulation' &&
            !String(e.payload.applicationId).startsWith('tick:'),
        );
        expect(reverted).toHaveLength(2);
        expect(reverted.at(-1)!.payload.visibleToUsers).toEqual([alice.id]);
      });

      it('hors de combat : un PNJ tombé est signalé au MJ seul', async () => {
        t.impose(CRIT, 3, 3);
        let a = await ok<Attack>(alice, 'POST', attacks(), {
          attackerId: thorin,
          action: 'attaque-libre',
          params: { score: 'Distance', nbDes: 1, faces: 6, bonus: 0 },
          targets: [hob1],
        });
        await rollSteps(alice, c.id, a);
        a = await ok<Attack>(gm, 'GET', `${attacks()}/${a.id}`);
        a = await ok<Attack>(gm, 'POST', `${attacks()}/${a.id}/apply`, {
          version: a.version,
          targets: [
            {
              characterId: hob1,
              apply: true,
              modifications: [
                { kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 50 },
              ],
            },
          ],
        });
        expect(a.targets[0]!.applied?.defeated).toBe(true);
        const defeated = (await campaignEvents(c.id)).filter(
          (e) => e.type === 'combat.participant_defeated',
        );
        expect(defeated.map((e) => e.visibility)).not.toContain('public');
        expect(defeated.map((e) => e.payload.characterId)).toContain(hob1);
        const state = await ok<Combat>(gm, 'GET', combat());
        expect(state.order.find((p) => p.characterId === hob1)?.defeated).toBe(true);
      });

      it('non-fuite : rien d’un PNJ dans ce que reçoivent les joueurs', async () => {
        const secrets = [goblin, 'Gobelin'];
        for (const u of [alice, bob]) {
          const got = [
            ...receivedBy(await campaignEvents(c.id), u),
            ...receivedBy(await characterEvents(c.id), u),
          ];
          const text = JSON.stringify(got);
          for (const s of secrets) expect(text).not.toContain(s);
          // Jamais un rapport complet, une fiche de PNJ, une décision détaillée
          for (const e of got) {
            expect(e.type).not.toBe('combat.attack_resolved');
            expect(e.type).not.toBe('combat.attack_decided');
            expect(e.type).not.toBe('combat.participant_defeated');
            if (e.type === 'character.updated') expect([thorin, balin]).toContain(e.aggregate.id);
          }
          const list = await ok<{ attacks: Attack[] }>(u, 'GET', attacks());
          for (const a of list.attacks) {
            expect(a.redacted).toBe(true);
            for (const x of a.targets) {
              expect(x.result).toBeUndefined();
              expect(x.applied).toBeUndefined();
            }
          }
        }
        // Jets transmis à l'historique : aucun ne nomme le gobelin ni un hobgobelin
        const text = JSON.stringify(
          t.rolls.filter((r) => r.campaignId === c.id && r.visibility === 'public'),
        );
        expect(text).not.toContain('Hobgobelin');
        expect(text).not.toContain('Gobelin');
      });

      it('en masse : deux attaques d’un coup, tout appliquer (réattribuée, auto-attaque)', async () => {
        t.impose(1, 1);
        const { attacks: batch } = await ok<{ attacks: Attack[] }>(
          gm,
          'POST',
          `${attacks()}/batch`,
          {
            attacks: [
              {
                attackerId: hob2,
                action: 'degats-libres',
                params: { nbDes: 1, faces: 2, bonus: 0 },
                targets: [balin],
              },
              {
                attackerId: hob2,
                action: 'degats-libres',
                params: { nbDes: 1, faces: 2, bonus: 0 },
                targets: [hob2],
              },
            ],
          },
        );
        expect(batch.map((a) => [a.status, a.visibility])).toEqual([
          ['pending', 'gm'],
          ['pending', 'gm'],
        ]);
        expect((batch[1] as Attack & { selfTarget: boolean }).selfTarget).toBe(true);
        const balinBefore = await value(bob, balin, 'PV');
        const hobBefore = await value(gm, hob2, 'PV');
        const done = await ok<{ attacks: Attack[] }>(gm, 'POST', `${attacks()}/apply`, {
          items: [
            {
              attackId: batch[0]!.id,
              version: batch[0]!.version,
              targets: [{ characterId: balin, apply: true, redirectTo: hob2 }],
            },
            {
              attackId: batch[1]!.id,
              version: batch[1]!.version,
              targets: [{ characterId: hob2, apply: true }],
            },
          ],
        });
        expect(done.attacks.map((a) => a.status)).toEqual(['applied', 'applied']);
        // Réattribuée : Balin ne perd rien, le hobgobelin prend les deux coups (une transaction)
        expect(await value(bob, balin, 'PV')).toBe(balinBefore);
        expect(await value(gm, hob2, 'PV')).toBe(hobBefore - 2);
      });

      it('écarter tout un rapport', async () => {
        t.impose(CRIT, 2, 2);
        let a = await ok<Attack>(gm, 'POST', attacks(), {
          attackerId: hob2,
          action: 'attaque-libre',
          params: { score: 'Contact', nbDes: 1, faces: 6, bonus: 0 },
          targets: [balin],
          visibility: 'public',
        });
        a = await rollSteps(gm, c.id, a);
        const before = await value(bob, balin, 'PV');
        a = await ok<Attack>(gm, 'POST', `${attacks()}/${a.id}/dismiss`, {
          version: a.version,
          note: 'Parade narrative',
        });
        expect(a.status).toBe('dismissed');
        expect(a.targets[0]!.decision).toBe('skipped');
        expect(await value(bob, balin, 'PV')).toBe(before);
      });

      it('fin de combat : états à durée retirés, rapports en attente écartés, plus de combat', async () => {
        const s = await sheet(bob, balin);
        await okSheet(bob, 'POST', `/v1/characters/${balin}/possessions`, {
          version: s.version,
          entree: 'assourdi',
          duree: 3,
        });
        t.impose(CRIT, 1, 1);
        const pending = await rollSteps(
          alice,
          c.id,
          await ok<Attack>(alice, 'POST', attacks(), {
            attackerId: thorin,
            action: 'attaque-libre',
            params: { score: 'Contact', nbDes: 1, faces: 6, bonus: 0 },
            targets: [hob2],
          }),
        );
        expect(pending.status).toBe('pending');
        const res = await t.toCampaign(gm, 'POST', `${combat()}/end`, {
          pendingAttacks: 'dismiss',
          clearTimedStates: true,
        });
        expect(res.statusCode, res.body).toBe(204);
        const after = await sheet(bob, balin);
        expect(after.etat.possessions.some((p) => p.entree === 'assourdi')).toBe(false);
        expect((await ok<Attack>(alice, 'GET', `${attacks()}/${pending.id}`)).status).toBe(
          'dismissed',
        );
        const none = await t.toCampaign(alice, 'GET', combat());
        expect(none.json()).toMatchObject({ status: 404, code: 'no_combat' });
      });
    });

    // ─── Star Wars ───────────────────────────────────────────────────────────

    describe('Star Wars : créneaux et Esquive', () => {
      let gm: RealUser;
      let carol: RealUser;
      let c: { id: string; mapId: string };
      let chewie: string;
      let soldier: string;

      beforeAll(async () => {
        gm = await t.user('MJ');
        carol = await t.user('Carol');
        c = await table(gm, 'star-wars-eote', [carol]);
        let p = await okSheet(carol, 'POST', '/v1/characters', {
          systemeId: 'star-wars-eote',
          type: 'personnage',
          nom: 'Chewie',
        });
        for (const x of [{ entree: 'wookiee' }, { entree: 'esquive', rang: 2 }])
          p = await okSheet(carol, 'POST', `/v1/characters/${p.id}/possessions`, {
            version: p.version,
            ...x,
          });
        chewie = p.id;
        await join(c, gm, carol, chewie, 100);
        [soldier] = (await npcs(c, gm, { quick: { name: 'Soldat', type: 'personnage' } }, 500)).map(
          (n) => n.id,
        ) as [string];
        let s = await sheet(gm, soldier);
        for (const x of [{ entree: 'fusil-blaster' }, { entree: 'distance-lourde', rang: 1 }])
          s = await okSheet(gm, 'POST', `/v1/characters/${soldier}/possessions`, {
            version: s.version,
            ...x,
          });
      });

      it('mode créneaux du système, initiative par camp', async () => {
        const started = await ok<Combat>(gm, 'POST', `/v1/campaigns/${c.id}/combat`, {
          participants: [chewie, soldier],
          rollInitiative: true,
          paramsBySide: {
            players: { competence: 'vigilance' },
            enemies: { competence: 'vigilance' },
          },
        });
        expect(started.mode).toBe('slots');
        expect(started.slots?.map((s) => s.side).sort()).toEqual(['enemies', 'players']);
        for (const p of started.order) expect(p.sortKeys).toHaveLength(2);
      });

      it('le PNJ attaque : la cible choisit son Esquive, le MJ applique', async () => {
        const stressBefore = await value(carol, chewie, 'stress');
        let a = await ok<Attack>(gm, 'POST', `/v1/campaigns/${c.id}/attacks`, {
          attackerId: soldier,
          action: 'attaque',
          params: { arme: 'fusil-blaster', portee: 'moyenne' },
          targets: [chewie],
        });
        expect(a).toMatchObject({ status: 'awaiting_reactions', visibility: 'gm' });
        expect(a.targets[0]!.reactionParams).toEqual(['esquive']);

        // Carol voit l'invite (attaque ouverte), sans rien du soldat
        const open = await ok<{ attacks: Attack[] }>(
          carol,
          'GET',
          `/v1/campaigns/${c.id}/attacks?status=open`,
        );
        const invite = open.attacks.find((x) => x.id === a.id)!;
        expect(invite).toBeDefined();
        expect(invite.redacted).toBe(true);
        expect(invite.targets.map((x) => x.characterId)).toEqual([chewie]);
        expect(JSON.stringify(invite)).not.toContain('fusil-blaster');

        const reacted = await ok<Attack>(
          carol,
          'POST',
          `/v1/campaigns/${c.id}/attacks/${a.id}/reactions`,
          { characterId: chewie, params: { esquive: 1 } },
        );
        expect(reacted.targets[0]!.characterId).toBe(chewie);

        // Réaction reçue : la réserve est la première étape, que le MJ (l'auteur) lance
        a = await ok<Attack>(gm, 'GET', `/v1/campaigns/${c.id}/attacks/${a.id}`);
        expect(a).toMatchObject({ status: 'awaiting_dice', pendingSteps: [{ phase: 'roll' }] });
        await rollSteps(gm, c.id, a);
        a = await ok<Attack>(gm, 'GET', `/v1/campaigns/${c.id}/attacks/${a.id}`);
        expect(a.status).toBe('pending');
        expect(a.targets[0]!.result?.roll.kind).toBe('symbols');
        expect(a.targets[0]!.result?.modifications).toContainEqual(
          expect.objectContaining({ attribute: 'stress', value: 1 }),
        );
        a = await ok<Attack>(gm, 'POST', `/v1/campaigns/${c.id}/attacks/${a.id}/apply`, {
          version: a.version,
          targets: [{ characterId: chewie, apply: true }],
        });
        expect(a.targets[0]!.decision).toBe('applied');
        expect(await value(carol, chewie, 'stress')).toBeGreaterThanOrEqual(stressBefore + 1);

        // Jet caché (MJ) : aucun jet public, aucune annonce
        expect(
          t.rolls
            .filter((r) => r.campaignId === c.id && r.actionId === 'attaque')
            .map((r) => r.visibility),
        ).toEqual(['gm']);
        const got = receivedBy(await campaignEvents(c.id), carol);
        expect(
          got.filter(
            (e) => e.type.startsWith('combat.attack_') && e.type !== 'combat.attack_updated',
          ),
        ).toEqual([]);
      });

      it('créneaux : le joueur prend le créneau de son camp et le termine', async () => {
        const url = `/v1/campaigns/${c.id}/combat`;
        let s = await ok<Combat>(gm, 'GET', url);
        for (let i = 0; i < 2; i++) {
          if (s.slots![s.currentIndex]!.side === 'players') {
            // Un joueur ne désigne que son personnage, pour un créneau de son camp
            s = await ok<Combat>(carol, 'POST', `${url}/slot-actor`, { characterId: chewie });
            expect(s).toMatchObject({ currentActorId: chewie, redacted: true });
            s = await ok<Combat>(carol, 'POST', `${url}/next`, {
              characterId: chewie,
              version: s.version,
            });
          } else {
            // Créneau ennemi : Carol ne peut pas le prendre
            const refused = await t.toCampaign(carol, 'POST', `${url}/slot-actor`, {
              characterId: chewie,
            });
            expect(refused.statusCode).toBeGreaterThanOrEqual(400);
            s = await ok<Combat>(gm, 'POST', `${url}/next`, { version: s.version });
          }
        }
        expect(s.round).toBe(2);
      });
    });

    // ─── Attaque en étapes (§ 6) ─────────────────────────────────────────────

    describe('Attaque en étapes : le toucher, puis les dégâts', () => {
      let gm: RealUser;
      let erin: RealUser;
      let c: { id: string; mapId: string };
      let hero: string;
      let hobA: string;
      let hobB: string;
      const attacks = () => `/v1/campaigns/${c.id}/attacks`;
      const dice = (u: RealUser, a: Attack, body: object) =>
        t.toCampaign(u, 'POST', `${attacks()}/${a.id}/dice`, body);
      const declare = (targets: string[]) =>
        ok<Attack>(erin, 'POST', attacks(), {
          attackerId: hero,
          action: 'attaque-libre',
          params: { score: 'Distance', nbDes: 1, faces: 6, bonus: 0 },
          targets,
        });

      beforeAll(async () => {
        gm = await t.user('MJ');
        erin = await t.user('Erin');
        c = await table(gm, 'dnd-classic', [erin]);
        hero = (await dwarf(erin, 'Dwalin')).id;
        await join(c, gm, erin, hero, 100);
        [hobA, hobB] = (
          await npcs(c, gm, { bestiary: { systemeId: 'dnd-classic', key: 'hobgoblin' } }, 400, {
            count: 2,
          })
        ).map((n) => n.id) as [string, string];
      });

      it('D&D : le d20 (TOUCHÉ vu du joueur), puis « Dégâts », puis le rapport', async () => {
        t.impose(CRIT, 4, 2);
        const declared = await declare([hobA]);
        expect(declared).toMatchObject({ status: 'awaiting_dice', redacted: true });
        expect(declared.pendingSteps).toEqual([
          expect.objectContaining({
            phase: 'roll',
            dice: [expect.objectContaining({ targetId: hobA, faces: 20 })],
          }),
        ]);

        // Étape 1 : touché (critique), aucun dégât encore ; l'étape des dégâts, doublés
        const res = await dice(erin, declared, {
          stepId: declared.pendingSteps[0]!.id,
          results: [],
        });
        expect(res.statusCode, res.body).toBe(200);
        const hit = res.json() as Attack;
        expect(hit.status).toBe('awaiting_dice');
        expect(hit.targets[0]).toMatchObject({
          status: 'awaiting_dice',
          view: { outcome: { success: true, critical: true }, values: [] },
        });
        expect(hit.pendingSteps[0]).toMatchObject({ phase: 'after', label: 'Dégâts' });
        expect(hit.pendingSteps[0]!.dice).toHaveLength(2);
        expect(JSON.stringify(hit)).not.toContain('Hobgobelin');
        // Rien à l'historique des dés avant la fin
        expect(t.rolls.filter((r) => r.campaignId === c.id)).toEqual([]);

        // Étape périmée : 409, rien ne bouge
        const outdated = await dice(erin, hit, {
          stepId: declared.pendingSteps[0]!.id,
          results: [],
        });
        expect(outdated.statusCode).toBe(409);
        expect(outdated.json()).toMatchObject({ code: 'step_outdated' });

        // Étape 2 : les dégâts, le rapport au MJ, le jet à l'historique
        const done = await rollSteps(erin, c.id, hit);
        expect(done).toMatchObject({ status: 'pending', pendingSteps: [] });
        expect(done.targets[0]!.view?.values).toEqual([
          expect.objectContaining({ key: 'degats', value: 6 }),
        ]);
        const full = await ok<Attack>(gm, 'GET', `${attacks()}/${declared.id}`);
        expect(full.targets[0]!.result?.modifications).toEqual([
          expect.objectContaining({ attribute: 'PV', operation: 'subtract', value: 6 }),
        ]);
        expect(t.rolls.filter((r) => r.campaignId === c.id)).toHaveLength(1);
      });

      it('D&D : le type d’attaque au jet, l’arme choisie à l’étape des dégâts', async () => {
        const s = await sheet(erin, hero);
        await okSheet(erin, 'POST', `/v1/characters/${hero}/possessions`, {
          version: s.version,
          entree: 'epee-longue',
        });
        t.impose(CRIT, 4, 3);
        const declared = await ok<Attack>(erin, 'POST', attacks(), {
          attackerId: hero,
          action: 'attaque',
          params: { score: 'Contact' },
          targets: [hobA],
        });
        expect(declared.pendingSteps[0]).toMatchObject({ phase: 'roll' });

        // Touché : l'étape suivante demande l'arme, sans dé
        const hit = await ok<Attack>(erin, 'POST', `${attacks()}/${declared.id}/dice`, {
          stepId: declared.pendingSteps[0]!.id,
          results: [],
        });
        expect(hit.targets[0]!.view?.outcome.success).toBe(true);
        expect(hit.pendingSteps[0]).toMatchObject({ phase: 'after', params: ['arme'], dice: [] });
        const missing = await dice(erin, hit, { stepId: hit.pendingSteps[0]!.id, results: [] });
        expect(missing.statusCode).toBe(400);
        expect(missing.json()).toMatchObject({ code: 'invalid_step_params' });

        // L'arme choisie : ses dés (doublés au critique), gardée avec l'attaque
        const armed = await ok<Attack>(erin, 'POST', `${attacks()}/${declared.id}/dice`, {
          stepId: hit.pendingSteps[0]!.id,
          results: [],
          params: { arme: 'epee-longue' },
        });
        expect(armed.params).toMatchObject({ score: 'Contact', arme: 'epee-longue' });
        expect(armed.pendingSteps[0]!.dice.map((d) => d.faces)).toEqual([8, 8]);
        const done = await rollSteps(erin, c.id, armed);
        expect(done).toMatchObject({ status: 'pending', pendingSteps: [] });
        expect(Number(done.targets[0]!.view?.values[0]?.value)).toBeGreaterThanOrEqual(7);
      });

      it('D&D : raté, pas d’étape de dégâts', async () => {
        t.impose(1);
        const declared = await declare([hobA]);
        const done = await ok<Attack>(erin, 'POST', `${attacks()}/${declared.id}/dice`, {
          stepId: declared.pendingSteps[0]!.id,
          results: [],
        });
        expect(done).toMatchObject({ status: 'pending', pendingSteps: [] });
        expect(done.targets[0]!.view?.outcome.success).toBe(false);
      });

      it('D&D : deux cibles, une ratée ; les dégâts de la seule touchée', async () => {
        t.impose(CRIT, 1, 5, 5);
        const declared = await declare([hobA, hobB]);
        expect(declared.pendingSteps[0]!.dice.map((d) => d.targetId)).toEqual([hobA, hobB]);
        const step1 = await ok<Attack>(erin, 'POST', `${attacks()}/${declared.id}/dice`, {
          stepId: declared.pendingSteps[0]!.id,
          results: [],
        });
        expect(step1.targets.map((x) => [x.status, x.view?.outcome.success])).toEqual([
          ['awaiting_dice', true],
          ['resolved', false],
        ]);
        expect(step1.pendingSteps[0]!.dice.every((d) => d.targetId === hobA)).toBe(true);
        const done = await rollSteps(erin, c.id, step1);
        expect(done.status).toBe('pending');
      });

      it('reprise par le MJ : l’auteur est parti, le serveur tire la suite', async () => {
        t.impose(CRIT, 3, 3);
        const declared = await declare([hobA]);
        const step1 = await ok<Attack>(erin, 'POST', `${attacks()}/${declared.id}/dice`, {
          stepId: declared.pendingSteps[0]!.id,
          results: [],
        });
        // Le MJ voit l'attaque en cours, puis tire tout le reste d'un coup
        const seen = await ok<Attack>(gm, 'GET', `${attacks()}/${declared.id}`);
        expect(seen).toMatchObject({ status: 'awaiting_dice', redacted: false });
        const done = await ok<Attack>(gm, 'POST', `${attacks()}/${declared.id}/dice`, {
          stepId: step1.pendingSteps[0]!.id,
          results: [],
          serverFallback: true,
        });
        expect(done).toMatchObject({ status: 'pending', pendingSteps: [] });
        // L'auteur retrouve son résultat : touché, dégâts
        const mine = await ok<Attack>(erin, 'GET', `${attacks()}/${declared.id}`);
        expect(mine.targets[0]!.view?.values).toEqual([
          expect.objectContaining({ key: 'degats', value: 6 }),
        ]);
      });

      it('Star Wars : la réserve dit tout, une seule étape sans critique', async () => {
        const gmSw = await t.user('MJ');
        const sw = await table(gmSw, 'star-wars-eote', []);
        const [tireur, cible] = (
          await npcs(sw, gmSw, { quick: { name: 'Tireur', type: 'personnage' } }, 100, {
            count: 2,
          })
        ).map((x) => x.id) as [string, string];
        let s = await sheet(gmSw, tireur);
        for (const x of [{ entree: 'fusil-blaster' }, { entree: 'distance-lourde', rang: 1 }])
          s = await okSheet(gmSw, 'POST', `/v1/characters/${tireur}/possessions`, {
            version: s.version,
            ...x,
          });
        // Toutes les faces vierges : raté, pas de critique
        t.impose(...Array<number>(20).fill(1));
        const a = await ok<Attack>(gmSw, 'POST', `/v1/campaigns/${sw.id}/attacks`, {
          attackerId: tireur,
          action: 'attaque',
          params: { arme: 'fusil-blaster', portee: 'moyenne' },
          targets: [cible],
        });
        expect(a.pendingSteps).toHaveLength(1);
        expect(a.pendingSteps[0]!.phase).toBe('roll');
        expect(a.pendingSteps[0]!.dice.every((d) => d.die)).toBe(true);
        const done = await ok<Attack>(gmSw, 'POST', `/v1/campaigns/${sw.id}/attacks/${a.id}/dice`, {
          stepId: a.pendingSteps[0]!.id,
          results: [],
        });
        expect(done).toMatchObject({ status: 'pending', pendingSteps: [] });
      });
    });

    // ─── Situation du combat (§ 5.7) ─────────────────────────────────────────

    describe('Situation du combat : paramètres, décompte, contexte des règles', () => {
      type Pool = { die: string; count: number }[];
      interface Full extends Attack {
        targets: (Target & {
          result?: {
            outcome: { success: boolean };
            roll: {
              kind: string;
              pool?: Pool;
              bonuses?: { name: string; value: number; side: string }[];
            };
            explanations: string[];
          } | null;
        })[];
      }

      it('D&D : l’abri de la cible et l’avantage de situation changent l’issue', async () => {
        const gm = await t.user('MJ');
        const dana = await t.user('Dana');
        const c = await table(gm, 'dnd-classic', [dana]);
        const hero = (await dwarf(dana, 'Dori')).id;
        await join(c, gm, dana, hero, 100);
        const [hob] = (
          await npcs(c, gm, { bestiary: { systemeId: 'dnd-classic', key: 'hobgoblin' } }, 400)
        ).map((n) => n.id) as [string];
        // Le d20 qui atteint juste la Défense du hobgobelin
        const n = (await value(gm, hob, 'Defense')) - (await value(dana, hero, 'Distance'));
        expect(n).toBeGreaterThanOrEqual(5);
        expect(n).toBeLessThanOrEqual(19);
        const tirer = async (params: Record<string, unknown>, faces: number[]) => {
          t.impose(...faces);
          const a = await ok<Full>(dana, 'POST', `/v1/campaigns/${c.id}/attacks`, {
            attackerId: hero,
            action: 'attaque-libre',
            params: { score: 'Distance', nbDes: 1, faces: 6, bonus: 0, ...params },
            targets: [hob],
          });
          return rollSteps(dana, c.id, a);
        };
        expect((await tirer({}, [n, 3])).targets[0]!.view?.outcome.success).toBe(true);
        // Abri partiel : +2 DEF, le même d20 rate ; le MJ lit la ligne dans le rapport
        const abri = await tirer({ couvert: 'partiel' }, [n]);
        expect(abri.targets[0]!.view?.outcome.success).toBe(false);
        const full = await ok<Full>(gm, 'GET', `/v1/campaigns/${c.id}/attacks/${abri.id}`);
        expect(full.targets[0]!.result?.roll.bonuses).toContainEqual(
          expect.objectContaining({ name: 'Abri de la cible', value: -2, side: 'action' }),
        );
        // Avantage de situation : deux d20, le meilleur ; sans lui, le premier rate
        expect((await tirer({}, [n - 3, n])).targets[0]!.view?.outcome.success).toBe(false);
        const avantage = await tirer({ avantage: 'avantage' }, [n - 3, n, 3]);
        expect(avantage.targets[0]!.view?.outcome.success).toBe(true);
        // Le joueur voit la situation qu'il a déclarée, et l'abri dans son jet (côté action)
        expect(avantage.targets[0]!.view?.explanations[0]).toBe(
          'Avantage ou désavantage : Avantage',
        );
        expect(abri.targets[0]!.view?.explanations).toContain('Abri de la cible : − 2');
      });

      it('Star Wars : surpris, décompte, Frappe rapide contre la cible qui n’a pas agi', async () => {
        const gm = await t.user('MJ');
        const c = await table(gm, 'star-wars-eote', []);
        const [tireur] = (
          await npcs(c, gm, { quick: { name: 'Tireur', type: 'personnage' } }, 100)
        ).map((x) => x.id) as [string];
        let s = await sheet(gm, tireur);
        for (const x of [
          { entree: 'fusil-blaster' },
          { entree: 'distance-lourde', rang: 1 },
          { entree: 'frappe-rapide', rang: 2 },
        ])
          s = await okSheet(gm, 'POST', `/v1/characters/${tireur}/possessions`, {
            version: s.version,
            ...x,
          });
        const [lent] = (
          await npcs(c, gm, { quick: { name: 'Lent', type: 'personnage' } }, 500)
        ).map((x) => x.id) as [string];
        const [vif] = (await npcs(c, gm, { quick: { name: 'Vif', type: 'personnage' } }, 600)).map(
          (x) => x.id,
        ) as [string];
        const url = `/v1/campaigns/${c.id}/combat`;
        let combat = await ok<Combat & { order: (Participant & { surprised?: boolean })[] }>(
          gm,
          'POST',
          url,
          {
            participants: [tireur, lent, vif],
            surprised: [lent],
            rollInitiative: true,
            paramsBySide: { enemies: { competence: 'vigilance' } },
          },
        );
        expect(combat.order.find((p) => p.characterId === lent)?.surprised).toBe(true);
        // Vif prend le premier créneau et le termine : il a agi ce round
        combat = await ok(gm, 'POST', `${url}/slot-actor`, { characterId: vif });
        combat = await ok(gm, 'POST', `${url}/next`, { version: combat.version });
        expect(combat.round).toBe(1);

        const a = await rollSteps(
          gm,
          c.id,
          await ok<Full>(gm, 'POST', `/v1/campaigns/${c.id}/attacks`, {
            attackerId: tireur,
            action: 'attaque',
            params: { arme: 'fusil-blaster', portee: 'moyenne' },
            targets: [lent, vif],
          }),
        );
        const fortune = (id: string) =>
          a.targets
            .find((x) => x.characterId === id)!
            .result!.roll.pool!.find((p) => p.die === 'fortune')?.count ?? 0;
        // Frappe rapide (rang 2) d'office contre Lent, qui n'a pas encore agi
        expect(fortune(lent)).toBe(fortune(vif) + 2);

        // Décompte : l'attaque compte pour le tireur et ses deux cibles
        const after = await ok<{
          order: {
            characterId: string;
            tally?: { attacksMade: number; attacksMadeRound: number; targeted: number };
          }[];
        }>(gm, 'GET', url);
        const tally = (id: string) => after.order.find((p) => p.characterId === id)?.tally;
        expect(tally(tireur)).toMatchObject({ attacksMade: 1, attacksMadeRound: 1 });
        expect(tally(lent)).toMatchObject({ targeted: 1 });
        expect(tally(vif)).toMatchObject({ targeted: 1 });
      });
    });
  },
);
