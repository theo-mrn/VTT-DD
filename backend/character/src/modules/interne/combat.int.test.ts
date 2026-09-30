/**
 * Combat, routes internes appelées par campaign (docs/combat.md § 11.2) : préparer et résoudre
 * une attaque (réactions, jet commun, déterminisme, vue de l'attaquant, historique des dés),
 * appliquer les décisions du MJ sans relancer un dé (idempotence, tout ou rien, tables, hors de
 * combat), les annuler (conflits, `force`), décompter les durées une seule fois par `tickId`.
 * Et la lecture des fiches de PNJ : un ennemi n'est lisible que par le MJ (Q4).
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { characters } from '../../db/schema.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type PersonnageApi, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const interne = { 'x-internal-secret': SECRET };

interface Resolution {
  targets: {
    characterId: string;
    status: 'resolved' | 'failed' | 'awaiting_dice';
    error: string | null;
    result: {
      outcome: { success: boolean };
      roll: { kind: string; dice?: unknown };
      variables: Record<string, unknown>;
      modifications: { kind: string; entity: string; attribute?: string; value?: number }[];
      tables: { table: string; line: { entry?: string } | null }[];
      explanations: string[];
    } | null;
    view: {
      outcome: { success: boolean };
      values: { key: string; value: unknown }[];
      explanations: string[];
    } | null;
  }[];
  actor: { modifications: unknown[] };
}

interface Etape {
  id: string;
  phase: 'roll' | 'after' | 'table';
  label?: string;
  dice: { id: string; targetId: string | null; faces: number; die?: string }[];
}

interface Face {
  id: string;
  value: number;
  source?: string;
}

interface Resolue {
  step: Etape | null;
  resolution: Resolution;
  faces: Face[];
}

interface Preparee {
  snapshot: unknown;
  action: { id: string; name: string };
  rollMode: 'per_target' | 'shared';
  dice: string;
  targets: { characterId: string; error: string | null; reactionParams: string[] }[];
  step: Etape | null;
  resolution: Resolution | null;
}

interface Appliquee {
  applications: {
    applicationId: string;
    replayed: boolean;
    items: {
      characterId: string;
      version: number;
      changes: { path: string }[];
      defeated: boolean;
    }[];
  }[];
}

describe.skipIf(!TEST_DATABASE_URL)('combat : routes internes', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let d: ReturnType<typeof droitsSimules>;
  let alice: Utilisateur;
  let bob: Utilisateur;
  let mj: Utilisateur;
  const campagne = crypto.randomUUID();

  beforeEach(async () => {
    d = droitsSimules();
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET }, { droits: d.droits });
    o = outils(t);
    alice = await t.utilisateur();
    bob = await t.utilisateur();
    mj = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const post = (url: string, payload: object) =>
    t.app.inject({ method: 'POST', url, headers: interne, payload });
  const lire = async (id: string) => {
    const [l] = await t.db!.select().from(characters).where(eq(characters.id, id));
    return l!;
  };
  const pv = async (id: string) => (await lire(id)).etat.valeurs.PV;
  const preparer = async (corps: object) => {
    const res = await post('/internal/actions/prepare', {
      userId: mj.id,
      campaignId: campagne,
      ...corps,
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as Preparee;
  };
  const resoudre = async (corps: object) => {
    const res = await post('/internal/actions/resolve', corps);
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as Resolue;
  };
  /**
   * Lance les étapes une à une, dés tirés par character (`results: []`), jusqu'aux résultats ;
   * rend chaque réponse, la dernière porte la résolution.
   */
  const parEtapes = async (corps: object, premiere: Etape | null) => {
    const reponses: Resolue[] = [];
    let faces: Face[] = [];
    for (let step = premiere; step;) {
      const r = await resoudre({ ...corps, faces, step, results: [] });
      reponses.push(r);
      faces = r.faces;
      step = r.step;
    }
    return reponses;
  };
  const appliquer = async (applications: object[]) => {
    const res = await post('/internal/modifications/apply', { applications });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as Appliquee;
  };

  /** Personnage Star Wars en jeu, avec des possessions. */
  async function starWars(u: Utilisateur, nom: string, possessions: object[]) {
    let p = await o.ok(u, 'POST', '/v1/characters', {
      systemeId: 'star-wars-eote',
      type: 'personnage',
      nom,
    });
    for (const x of possessions)
      p = await o.ok(u, 'POST', `/v1/characters/${p.id}/possessions`, { version: p.version, ...x });
    return p;
  }

  // ─── Préparer, résoudre ──────────────────────────────────────────────────────

  it('attaque en deux étapes : le d20 (touché), puis les dégâts ; vue de l’attaquant', async () => {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    const gobelin = await o.nainGuerrier(mj, 'Gobelin');
    t.des.imposer(18, 6);
    const diceHistory = { campaignId: campagne, authorId: alice.id, visibility: 'public' };
    const params = { arme: 'epee-longue' };
    const p = await preparer({
      actorId: thorin.id,
      action: 'attaque',
      params,
      targetIds: [gobelin.id],
      diceHistory,
    });
    // Préparer ne lance rien : la première étape, le d20 de la cible
    expect(p).toMatchObject({
      action: { id: 'attaque', name: 'Attaque avec une arme' },
      rollMode: 'per_target',
      dice: 'server',
      targets: [{ characterId: gobelin.id, error: null, reactionParams: [] }],
      step: {
        phase: 'roll',
        label: 'Attaque avec une arme',
        dice: [{ id: '0:jet:d20:0', targetId: gobelin.id, faces: 20 }],
      },
      resolution: null,
    });
    const corps = { snapshot: p.snapshot, params, rollMode: p.rollMode, diceHistory };
    const jet = await resoudre({ ...corps, step: p.step, results: [] });

    // Étape 1 : touché, sans dégâts ; l'étape des dégâts, nommée d'après les données
    expect(jet.step).toMatchObject({ phase: 'after', label: 'Dégâts' });
    expect(jet.step!.dice.every((d) => d.targetId === gobelin.id)).toBe(true);
    expect(jet.faces).toEqual([{ id: '0:jet:d20:0', value: 18, source: 'server' }]);
    const t1 = jet.resolution.targets[0]!;
    expect(t1).toMatchObject({ status: 'awaiting_dice', view: { outcome: { success: true } } });
    expect(t1.view!.values).toEqual([]);
    expect(t1.result!.modifications).toEqual([]);
    expect(jet.resolution.actor.modifications).toEqual([]);
    // Rien ne part à l'historique avant la fin
    expect(t.jets).toHaveLength(0);
    const degats = await resoudre({ ...corps, faces: jet.faces, step: jet.step, results: [] });

    // Étape 2 : les dégâts, le rapport complet
    expect(degats.step).toBeNull();
    const r = degats.resolution.targets[0]!;
    expect(r.status).toBe('resolved');
    expect(r.result!.roll.kind).toBe('numeric');
    expect(r.result!.outcome.success).toBe(true);
    expect(r.result!.modifications).toContainEqual(
      expect.objectContaining({ kind: 'attribute', entity: 'target', attribute: 'PV' }),
    );
    // La vue de l'attaquant : les dégâts lancés, rien de ce que la cible encaisse
    expect(r.view!.values.map((v) => v.key)).toEqual(['degats']);
    expect(JSON.stringify(r.view)).not.toMatch(/"subis"|"brut"|Defense|PV/);
    // Rien n'est appliqué
    expect((await lire(gobelin.id)).version).toBe(gobelin.version);

    // Historique des dés : la vue de l'attaquant, avec la visibilité demandée
    expect(t.jets).toHaveLength(1);
    expect(t.jets[0]).toMatchObject({
      campaignId: campagne,
      authorId: alice.id,
      characterId: thorin.id,
      actionId: 'attaque',
      visibility: 'public',
    });
    expect(t.jets[0]!.explanations.join('\n')).not.toMatch(/Défense|PV|subis/);
  });

  it('raté : une seule étape ; faces lues sur les dés 3D, faces invalides refusées', async () => {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    const gobelin = await o.nainGuerrier(mj, 'Gobelin');
    const params = { arme: 'epee-longue' };
    const p = await preparer({
      actorId: thorin.id,
      action: 'attaque',
      params,
      targetIds: [gobelin.id],
    });
    const corps = { snapshot: p.snapshot, params, rollMode: p.rollMode, step: p.step };
    // Dé inconnu de l'étape, face hors du dé : 400, rien n'est résolu
    for (const results of [[{ id: 'x', value: 3 }], [{ id: '0:jet:d20:0', value: 21 }]]) {
      const res = await post('/internal/actions/resolve', { ...corps, results });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'invalid_physical_result' });
    }
    // Le 1 lu sur le dé 3D : raté, pas d'étape de dégâts
    const r = await resoudre({ ...corps, results: [{ id: '0:jet:d20:0', value: 1 }] });
    expect(r.step).toBeNull();
    expect(r.faces).toEqual([{ id: '0:jet:d20:0', value: 1, source: 'physical' }]);
    expect(r.resolution.targets[0]).toMatchObject({
      status: 'resolved',
      result: { outcome: { success: false }, modifications: [] },
    });
  });

  it('contexte du combat (@combat.*) : figé à la préparation, lu à la résolution', async () => {
    const bossk = await starWars(alice, 'Bossk', [
      { entree: 'bothan' },
      { entree: 'fusil-blaster' },
      { entree: 'frappe-rapide', rang: 2 },
    ]);
    const endormi = await starWars(mj, 'Endormi', [{ entree: 'wookiee' }]);
    const vif = await starWars(mj, 'Vif', [{ entree: 'wookiee' }]);
    const compte = { attacksMade: 0, attacksMadeRound: 0, targeted: 0, targetedRound: 0 };
    const p = await preparer({
      actorId: bossk.id,
      action: 'attaque',
      params: { arme: 'fusil-blaster', portee: 'moyenne' },
      targetIds: [endormi.id, vif.id],
      // Premier round : Frappe rapide contre la cible dont le tour n'est pas encore passé
      combat: {
        round: 1,
        actor: { ...compte, hasActed: false, surprised: false },
        targets: [
          { characterId: endormi.id, ...compte, hasActed: false, surprised: true },
          { characterId: vif.id, ...compte, hasActed: true, surprised: false },
        ],
      },
    });
    // La réserve de chaque cible est dans sa première étape : un dé de Fortune par dé
    const fortune = (step: Etape | null, i: number) =>
      step!.dice.filter((d) => d.die === 'fortune' && d.id.startsWith(`${i}:`)).length;
    expect(fortune(p.step, 0)).toBe(fortune(p.step, 1) + 2);
    // L'instantané garde le contexte : la résolution suivante le relit
    const { resolution: r } = await resoudre({
      snapshot: p.snapshot,
      params: { arme: 'fusil-blaster', portee: 'moyenne' },
      rollMode: 'per_target',
      serverFallback: true,
    });
    type Pool = { kind: string; pool?: { die: string; count: number }[] };
    const tiree = (i: number) =>
      (r.targets[i]!.result!.roll as Pool).pool?.find((x) => x.die === 'fortune')?.count ?? 0;
    expect(tiree(0)).toBe(tiree(1) + 2);
    // Sans contexte : hors combat, rien d'office
    const hors = await preparer({
      actorId: bossk.id,
      action: 'attaque',
      params: { arme: 'fusil-blaster', portee: 'moyenne' },
      targetIds: [endormi.id, vif.id],
    });
    expect(fortune(hors.step, 0)).toBe(fortune(hors.step, 1));
    // Contexte mal formé : refusé par la validation
    const mauvais = await post('/internal/actions/prepare', {
      userId: mj.id,
      campaignId: campagne,
      actorId: bossk.id,
      action: 'attaque',
      targetIds: [vif.id],
      combat: { round: 0, targets: [] },
    });
    expect(mauvais.statusCode).toBe(400);
  });

  it('déterministe : même instantané, mêmes dés, même résultat', async () => {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    const gobelin = await o.nainGuerrier(mj, 'Gobelin');
    const p = await preparer({
      actorId: thorin.id,
      action: 'attaque',
      params: { arme: 'epee-longue' },
      targetIds: [gobelin.id],
    });
    const toutTirer = async () => {
      t.des.imposer(12, 3);
      return resoudre({
        snapshot: p.snapshot,
        params: { arme: 'epee-longue' },
        rollMode: 'per_target',
        serverFallback: true,
      });
    };
    const a = await toutTirer();
    // La fiche change entre-temps : l'instantané fait foi
    await t.db!.update(characters).set({ nom: 'Autre' }).where(eq(characters.id, gobelin.id));
    expect(await toutTirer()).toEqual(a);
    expect(a.step).toBeNull();
    // Rejouer les mêmes faces, sans étape : le même résultat, rien n'est tiré
    t.des.imposer();
    const rejoue = await resoudre({
      snapshot: p.snapshot,
      params: { arme: 'epee-longue' },
      rollMode: 'per_target',
      faces: a.faces,
    });
    expect(rejoue.resolution).toEqual(a.resolution);
  });

  it('jet commun : les mêmes dés pour toutes les cibles', async () => {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    const a = await o.nainGuerrier(mj, 'Gobelin A');
    const b = await o.nainGuerrier(mj, 'Gobelin B');
    t.des.imposer(3, 4);
    const p = await preparer({
      actorId: thorin.id,
      action: 'degats-libres',
      params: { nbDes: 2, faces: 6, bonus: 0 },
      targetIds: [a.id, b.id],
      diceHistory: { campaignId: campagne, authorId: mj.id, visibility: 'gm' },
    });
    expect(p.rollMode).toBe('shared');
    // Des dés communs : sans cible
    expect(p.step!.dice.map((d) => d.targetId)).toEqual([null, null]);
    const reponses = await parEtapes(
      {
        snapshot: p.snapshot,
        params: { nbDes: 2, faces: 6, bonus: 0 },
        rollMode: p.rollMode,
        diceHistory: { campaignId: campagne, authorId: mj.id, visibility: 'gm' },
      },
      p.step,
    );
    const fin = reponses.at(-1)!.resolution;
    expect(fin.targets.map((x) => x.result!.variables.degats)).toEqual([7, 7]);
    // Un seul jet dans l'historique pour un jet commun
    expect(t.jets).toHaveLength(1);
    expect(t.jets[0]!.visibility).toBe('gm');
  });

  it('refus des règles : action inconnue, arme non possédée, personnage absent', async () => {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    const gobelin = await o.nainGuerrier(mj, 'Gobelin');
    const base = { userId: mj.id, campaignId: campagne, actorId: thorin.id };
    const inconnue = await post('/internal/actions/prepare', {
      ...base,
      action: 'inconnue',
      targetIds: [gobelin.id],
    });
    expect(inconnue.statusCode).toBe(422);
    expect(inconnue.json()).toMatchObject({ code: 'action_refusee' });
    const sansArme = await post('/internal/actions/prepare', {
      ...base,
      action: 'attaque',
      params: { arme: 'arc-long' },
      targetIds: [gobelin.id],
    });
    expect(sansArme.statusCode).toBe(422);
    expect(sansArme.json().detail).toMatch(/n’est pas possédée/);
    const absent = await post('/internal/actions/prepare', {
      ...base,
      action: 'attaque',
      targetIds: [crypto.randomUUID()],
    });
    expect(absent.statusCode).toBe(404);
    expect(absent.json()).toMatchObject({ code: 'character_not_found' });
  });

  it('Star Wars : Esquive proposée à la cible, résolue avec sa réaction', async () => {
    const bossk = await starWars(alice, 'Bossk', [
      { entree: 'bothan' },
      { entree: 'fusil-blaster' },
      { entree: 'distance-lourde', rang: 1 },
    ]);
    const agile = await starWars(mj, 'Agile', [
      { entree: 'wookiee' },
      { entree: 'esquive', rang: 2 },
    ]);
    const lourd = await starWars(mj, 'Lourd', [{ entree: 'wookiee' }]);
    const params = { arme: 'fusil-blaster', portee: 'moyenne' };
    const p = await preparer({
      actorId: bossk.id,
      action: 'attaque',
      params,
      targetIds: [agile.id, lourd.id],
    });
    expect(p.targets.map((x) => x.reactionParams)).toEqual([['esquive'], []]);
    expect(p.resolution).toBeNull();

    expect(p.step).toBeNull();

    const corps = {
      snapshot: p.snapshot,
      params,
      rollMode: p.rollMode,
      reactions: [
        { characterId: agile.id, params: { esquive: 2 } },
        { characterId: lourd.id, skipped: true },
      ],
    };
    // Réactions reçues : la première étape, la réserve (l'Esquive y met ses Défis)
    const plan = await resoudre(corps);
    expect(plan.step!.phase).toBe('roll');
    expect(plan.step!.dice.filter((d) => d.die === 'defi' && d.targetId === agile.id)).toHaveLength(
      2,
    );
    expect(plan.resolution.targets.map((x) => x.status)).toEqual([
      'awaiting_dice',
      'awaiting_dice',
    ]);
    const reponses = await parEtapes(corps, plan.step);
    const [a, l] = reponses.at(-1)!.resolution.targets;
    expect(a!.result!.roll.kind).toBe('symbols');
    expect(a!.result!.modifications).toContainEqual(
      expect.objectContaining({ entity: 'target', attribute: 'stress', value: 2 }),
    );
    expect(l!.result!.modifications.some((m) => m.attribute === 'stress')).toBe(false);
    expect(a!.view!.values.map((v) => v.key)).toEqual(['degatsBruts']);
  });

  // ─── Appliquer, annuler ──────────────────────────────────────────────────────

  it('applique sans relancer, une seule fois par applicationId', async () => {
    const gobelin = await o.nainGuerrier(mj, 'Gobelin');
    const avant = Number(await pv(gobelin.id));
    const application = {
      applicationId: crypto.randomUUID(),
      userId: mj.id,
      campaignId: campagne,
      items: [
        {
          characterId: gobelin.id,
          modifications: [{ kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 2 }],
        },
      ],
    };
    const r1 = await appliquer([application]);
    const item = r1.applications[0]!.items[0]!;
    expect(r1.applications[0]!.replayed).toBe(false);
    expect(item).toMatchObject({
      characterId: gobelin.id,
      version: gobelin.version + 1,
      defeated: false,
    });
    expect(item.changes.map((c) => c.path)).toEqual(['etat.valeurs.PV']);
    expect(await pv(gobelin.id)).toBe(avant - 2);

    // Reprise réseau : la réponse d'origine, rien d'écrit deux fois
    const r2 = await appliquer([application]);
    expect(r2.applications[0]).toEqual({ ...r1.applications[0], replayed: true });
    expect(await pv(gobelin.id)).toBe(avant - 2);
  });

  it('tout ou rien : une modification invalide, rien n’est écrit', async () => {
    const a = await o.nainGuerrier(mj, 'A');
    const b = await o.nainGuerrier(mj, 'B');
    const res = await post('/internal/modifications/apply', {
      applications: [
        {
          applicationId: crypto.randomUUID(),
          campaignId: campagne,
          items: [
            {
              characterId: a.id,
              modifications: [
                { kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 1 },
              ],
            },
            {
              characterId: b.id,
              modifications: [
                { kind: 'attribute', attribute: 'Inconnu', operation: 'add', value: 1 },
                { kind: 'entry', entry: 'nulle-part', operation: 'give', ranks: 1 },
              ],
            },
          ],
        },
      ],
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      code: 'modification_invalide',
      errors: [
        { characterId: b.id, message: expect.stringContaining('Inconnu') },
        { characterId: b.id, message: expect.stringContaining('nulle-part') },
      ],
    });
    expect((await lire(a.id)).version).toBe(a.version);
    expect((await lire(b.id)).version).toBe(b.version);
  });

  it('hors de combat après application, ressource ramenée dans ses bornes', async () => {
    const gobelin = await o.nainGuerrier(mj, 'Gobelin');
    const r = await appliquer([
      {
        applicationId: crypto.randomUUID(),
        campaignId: campagne,
        items: [
          {
            characterId: gobelin.id,
            modifications: [
              { kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 999 },
            ],
          },
        ],
      },
    ]);
    expect(r.applications[0]!.items[0]!.defeated).toBe(true);
    expect(await pv(gobelin.id)).toBe(0);
  });

  it('table appliquée : l’entrée de la ligne tirée, ou d’une autre ligne choisie', async () => {
    const cible = await starWars(mj, 'Cible', [{ entree: 'wookiee' }]);
    const application = (entry: string) => ({
      applicationId: crypto.randomUUID(),
      campaignId: campagne,
      items: [
        {
          characterId: cible.id,
          modifications: [],
          tables: [{ table: 'blessures-critiques', entry }],
        },
      ],
    });
    await appliquer([application('fracture')]);
    expect((await lire(cible.id)).etat.possessions.map((p) => p.entree)).toContain('fracture');
    const horsTable = await post('/internal/modifications/apply', {
      applications: [application('wookiee')],
    });
    expect(horsTable.statusCode).toBe(422);
  });

  it('annule une application ; conflit si la fiche a changé, `force` passe outre', async () => {
    const gobelin = await o.nainGuerrier(mj, 'Gobelin');
    const avant = Number(await pv(gobelin.id));
    const coup = (applicationId: string) => ({
      applicationId,
      userId: mj.id,
      campaignId: campagne,
      items: [
        {
          characterId: gobelin.id,
          modifications: [
            { kind: 'attribute', attribute: 'PV', operation: 'subtract', value: 3 },
            { kind: 'entry', entry: 'aveugle', operation: 'give', ranks: 0, duration: 2 },
          ],
        },
      ],
    });
    const id1 = crypto.randomUUID();
    await appliquer([coup(id1)]);
    const r1 = await post('/internal/modifications/revert', { applicationId: id1 });
    expect(r1.statusCode, r1.body).toBe(200);
    expect(r1.json().items[0]).toMatchObject({ status: 'reverted', defeated: false });
    const l1 = await lire(gobelin.id);
    expect(l1.etat.valeurs.PV).toBe(avant);
    expect(l1.etat.possessions.some((p) => p.entree === 'aveugle')).toBe(false);
    // Annuler deux fois ne rend rien de plus
    const r2 = await post('/internal/modifications/revert', { applicationId: id1 });
    expect(r2.json().items[0]).toMatchObject({ status: 'already_reverted' });

    // La fiche change après l'application : conflit, rien n'est écrit
    const id2 = crypto.randomUUID();
    await appliquer([coup(id2)]);
    const l2 = await lire(gobelin.id);
    await t
      .db!.update(characters)
      // Une autre valeur que celle laissée par l'application (les PV de départ sont tirés)
      .set({
        etat: { ...l2.etat, valeurs: { ...l2.etat.valeurs, PV: l2.etat.valeurs.PV === 1 ? 2 : 1 } },
      })
      .where(eq(characters.id, gobelin.id));
    const conflit = await post('/internal/modifications/revert', { applicationId: id2 });
    expect(conflit.statusCode).toBe(409);
    expect(conflit.json()).toMatchObject({
      code: 'revert_conflict',
      conflicts: [{ characterId: gobelin.id, paths: ['etat.valeurs.PV'] }],
    });
    expect((await lire(gobelin.id)).etat.possessions.some((p) => p.entree === 'aveugle')).toBe(
      true,
    );
    const force = await post('/internal/modifications/revert', { applicationId: id2, force: true });
    expect(force.statusCode).toBe(200);
    expect(await pv(gobelin.id)).toBe(avant);

    const inconnue = await post('/internal/modifications/revert', {
      applicationId: crypto.randomUUID(),
    });
    expect(inconnue.json()).toMatchObject({ code: 'application_not_found' });
  });

  // ─── Durées ──────────────────────────────────────────────────────────────────

  it('durée d’un état posé sur la fiche, décomptée une fois par tickId, annulable', async () => {
    let p: PersonnageApi = await o.nainGuerrier(alice, 'Thorin');
    p = await o.ok(alice, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'etourdi',
      duree: 1,
    });
    p = await o.ok(alice, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'effraye',
      duree: 3,
    });
    const duree = async (entree: string) =>
      (await lire(p.id)).etat.possessions.find((x) => x.entree === entree)?.duree;
    expect(await duree('etourdi')).toBe(1);

    const tickId = `tick:${crypto.randomUUID()}:1`;
    const t1 = await post(`/internal/characters/${p.id}/durees/decompter`, { tickId });
    expect(t1.json()).toMatchObject({ modifie: true, retirees: ['etourdi'], replayed: false });
    const t2 = await post(`/internal/characters/${p.id}/durees/decompter`, { tickId });
    expect(t2.json()).toEqual({
      modifie: true,
      retirees: ['etourdi'],
      version: p.version + 1,
      replayed: true,
    });
    expect(await duree('effraye')).toBe(2);

    // « Précédent » : l'état expiré revient avec sa durée d'avant
    const r = await post('/internal/modifications/revert', { applicationId: tickId });
    expect(r.statusCode, r.body).toBe(200);
    expect(await duree('etourdi')).toBe(1);
    expect(await duree('effraye')).toBe(3);

    // Fin de combat : tous les états à durée retirés d'un coup, annulable aussi
    const fin = `end:${crypto.randomUUID()}`;
    const r3 = await post(`/internal/characters/${p.id}/durees/decompter`, {
      tickId: fin,
      clear: true,
    });
    expect(r3.json()).toMatchObject({ modifie: true, retirees: ['etourdi', 'effraye'] });
    await post('/internal/modifications/revert', { applicationId: fin });
    expect(await duree('effraye')).toBe(3);

    // Une durée retirée : la possession reste jusqu'au retrait
    p = await o.ok(alice, 'GET', `/v1/characters/${p.id}`);
    p = await o.ok(alice, 'POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'effraye',
      duree: null,
    });
    expect(await duree('effraye')).toBeUndefined();
  });

  it('état libre : un bonus sans effet, avec sa durée, décompté en fin de round', async () => {
    const p = await o.nainGuerrier(alice, 'Thorin');
    const res = await t.app.inject({
      method: 'POST',
      url: `/v1/characters/${p.id}/bonus`,
      headers: alice.auth,
      payload: { version: p.version, id: 'marque', nom: 'Marqué', effets: [], duree: 1 },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { etat: { bonus: unknown[] } }).etat.bonus).toEqual([
      { id: 'marque', nom: 'Marqué', effets: [], actif: true, duree: 1 },
    ]);
    const tick = await post(`/internal/characters/${p.id}/durees/decompter`, {
      tickId: `tick:${crypto.randomUUID()}:1`,
    });
    expect(tick.json()).toMatchObject({ modifie: true, retirees: ['bonus:marque'] });
  });

  // ─── Lecture des PNJ (Q4) ────────────────────────────────────────────────────

  it('fiche d’un PNJ ennemi réservée au MJ ; un allié reste lisible', async () => {
    const pnj = await o.nainGuerrier(mj, 'Orc');
    await t.db!.update(characters).set({ kind: 'npc' }).where(eq(characters.id, pnj.id));
    const lecteur = { lecture: true, ecriture: false, engage: true, campagnes: [campagne] };
    d.accorder(pnj.id, bob.id, lecteur);
    d.accorder(pnj.id, alice.id, { ...lecteur, ecriture: true, campagnesMj: [campagne] });
    const lireFiche = (u: Utilisateur) =>
      t.app.inject({ method: 'GET', url: `/v1/characters/${pnj.id}`, headers: u.auth });

    d.camper(campagne, pnj.id, 'enemies');
    expect((await lireFiche(bob)).statusCode).toBe(404);
    // Le MJ (qui l'écrit) et le propriétaire lisent toujours
    expect((await lireFiche(alice)).statusCode).toBe(200);
    expect((await lireFiche(mj)).statusCode).toBe(200);

    d.camper(campagne, pnj.id, 'allies');
    expect((await lireFiche(bob)).statusCode).toBe(200);

    // Un personnage joueur ennemi (PvP) reste lisible : seule la fiche d'un PNJ est protégée
    await t.db!.update(characters).set({ kind: 'pc' }).where(eq(characters.id, pnj.id));
    d.camper(campagne, pnj.id, 'enemies');
    expect((await lireFiche(bob)).statusCode).toBe(200);
  });
});
