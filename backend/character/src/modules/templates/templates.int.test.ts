/**
 * Modèles du MJ (catégories et modèles de PNJ, modèles d'objets) : réservés
 * au MJ de la campagne (rôles simulés à la place de campaign), écritures
 * avec leur événement gm_only dans l'outbox, diff des mises à jour.
 */
import { inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { npcTemplateCategories, npcTemplates, objectTemplates, outbox } from '../../db/schema.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

interface Row {
  id: string;
  version: number;
  categoryId?: string | null;
  etat?: { creation: boolean; valeurs: Record<string, unknown>; systeme: { id: string } };
  fiche?: { valeurs: Record<string, { valeur: unknown }> };
}

describe.skipIf(!TEST_DATABASE_URL)('modèles du MJ', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let mj: Utilisateur;
  let joueur: Utilisateur;
  let etranger: Utilisateur;
  const campagnes: string[] = [];
  let campagne: string;
  let base: string;

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({}, { droits: salles.droits });
    o = outils(t);
    [mj, joueur, etranger] = await Promise.all([t.utilisateur(), t.utilisateur(), t.utilisateur()]);
    campagne = crypto.randomUUID();
    campagnes.push(campagne);
    salles.nommer(campagne, mj.id, 'gm');
    salles.nommer(campagne, joueur.id, 'player');
    base = `/v1/campaigns/${campagne}`;
  });

  afterEach(async () => {
    const db = t.db!;
    await db.delete(npcTemplates).where(inArray(npcTemplates.campaignId, campagnes));
    await db
      .delete(npcTemplateCategories)
      .where(inArray(npcTemplateCategories.campaignId, campagnes));
    await db.delete(objectTemplates).where(inArray(objectTemplates.campaignId, campagnes));
    await db.delete(outbox).where(inArray(sql`${outbox.envelope}->>'roomId'`, campagnes));
    await t.fermer();
  });

  const ok = async (
    u: Utilisateur,
    method: Parameters<typeof o.requete>[1],
    url: string,
    body?: unknown,
  ) => {
    const res = await o.requete(u, method, url, body);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
    return (res.statusCode === 204 ? undefined : res.json()) as Row;
  };

  const evenements = async (id: string) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${id}`)
        .orderBy(outbox.id)
    ).map((e) => e.envelope as Record<string, any>);

  it('réservé au MJ : 404 hors campagne, 403 pour un joueur, 503 si campaign est injoignable', async () => {
    for (const url of ['/npc-templates', '/npc-template-categories', '/object-templates']) {
      expect((await o.requete(etranger, 'GET', base + url)).statusCode).toBe(404);
      expect((await o.requete(joueur, 'GET', base + url)).statusCode).toBe(403);
      expect((await o.requete(mj, 'GET', base + url)).json()).toEqual([]);
    }
    const creation = { name: 'Gobelin', systemeId: 'dnd-classic', type: 'personnage' };
    expect((await o.requete(joueur, 'POST', `${base}/npc-templates`, creation)).statusCode).toBe(
      403,
    );
    salles.panne(true);
    const res = await o.requete(mj, 'GET', `${base}/npc-templates`);
    expect([res.statusCode, res.json().code]).toEqual([503, 'campaign_unavailable']);
    // Le MJ d'une campagne ne voit pas les modèles d'une autre
    salles.panne(false);
    const autre = crypto.randomUUID();
    campagnes.push(autre);
    salles.nommer(autre, mj.id, 'gm');
    const m = await ok(mj, 'POST', `${base}/npc-templates`, creation);
    expect(await ok(mj, 'GET', `/v1/campaigns/${autre}/npc-templates`)).toEqual([]);
    const ailleurs = await o.requete(mj, 'PATCH', `/v1/campaigns/${autre}/npc-templates/${m.id}`, {
      version: 1,
      name: 'Volé',
    });
    expect(ailleurs.statusCode).toBe(404);
  });

  it('modèle de PNJ : état du système validé, diff des mises à jour, événements gm_only', async () => {
    const vide = await ok(mj, 'POST', `${base}/npc-templates`, {
      name: 'Gobelin',
      systemeId: 'dnd-classic',
      type: 'personnage',
    });
    expect(vide.etat).toMatchObject({ creation: false, systeme: { id: 'dnd-classic' } });

    const m = await ok(mj, 'POST', `${base}/npc-templates`, {
      name: 'Orque',
      tokenUrl: 'https://exemple.test/orque.png',
      actions: [{ name: 'Hache', description: '1d8', toHit: 4 }],
      etat: {
        type: 'personnage',
        systeme: { id: 'dnd-classic', version: '1.0.0' },
        valeurs: { FOR: 16, niveau: 2 },
        creation: true,
      },
    });
    expect(m.etat).toMatchObject({ creation: false, valeurs: { FOR: 16 } });
    expect(m.fiche!.valeurs.Contact!.valeur).toBe(5); // mod FOR 3 + niveau 2

    // État invalide ou d'un autre système : refusé
    const invalide = await o.requete(mj, 'POST', `${base}/npc-templates`, {
      name: 'X',
      etat: { type: 'personnage', systeme: { id: 'inconnu', version: '1' } },
    });
    expect(invalide.statusCode).toBe(400);
    const autreSysteme = await o.requete(mj, 'PATCH', `${base}/npc-templates/${m.id}`, {
      version: 1,
      etat: { type: 'personnage', systeme: { id: 'star-wars-eote', version: '1.0.0' } },
    });
    expect(autreSysteme.statusCode).toBe(422);

    const perime = await o.requete(mj, 'PATCH', `${base}/npc-templates/${m.id}`, {
      version: 7,
      name: 'Orque chef',
    });
    expect([perime.statusCode, perime.json().code]).toEqual([409, 'version_perimee']);

    const modifie = await ok(mj, 'PATCH', `${base}/npc-templates/${m.id}`, {
      version: 1,
      name: 'Orque chef',
      etat: { ...m.etat, valeurs: { FOR: 18, niveau: 2 } },
    });
    expect(modifie).toMatchObject({ version: 2, etat: { valeurs: { FOR: 18 } } });

    await ok(mj, 'DELETE', `${base}/npc-templates/${m.id}`);
    expect((await ok(mj, 'GET', `${base}/npc-templates`)) as unknown).toHaveLength(1);

    const ev = await evenements(m.id);
    expect(ev.map((e) => e.type)).toEqual([
      'npc_template.created',
      'npc_template.updated',
      'npc_template.deleted',
    ]);
    for (const e of ev)
      expect(e).toMatchObject({
        roomId: campagne,
        visibility: 'gm_only',
        actor: { userId: mj.id, role: 'gm' },
        aggregate: { type: 'npc_template', id: m.id },
      });
    expect(ev[1]!.payload.changes).toEqual([
      { path: 'etat.valeurs.FOR', before: 16, after: 18 },
      { path: 'name', before: 'Orque', after: 'Orque chef' },
    ]);
  });

  it('catégories : une catégorie d’une autre campagne est refusée ; supprimée, ses modèles restent', async () => {
    const c = await ok(mj, 'POST', `${base}/npc-template-categories`, {
      name: 'Rencontre #1',
      color: '#ef4444',
    });
    const renommee = await ok(mj, 'PATCH', `${base}/npc-template-categories/${c.id}`, {
      version: 1,
      name: 'Gobelins',
    });
    expect(renommee.version).toBe(2);

    const autre = crypto.randomUUID();
    campagnes.push(autre);
    salles.nommer(autre, mj.id, 'gm');
    const etrangere = await ok(mj, 'POST', `/v1/campaigns/${autre}/npc-template-categories`, {
      name: 'Ailleurs',
    });
    const refus = await o.requete(mj, 'POST', `${base}/npc-templates`, {
      name: 'Gobelin',
      categoryId: etrangere.id,
      systemeId: 'dnd-classic',
      type: 'personnage',
    });
    expect([refus.statusCode, refus.json().code]).toEqual([422, 'category_not_found']);

    const m = await ok(mj, 'POST', `${base}/npc-templates`, {
      name: 'Gobelin',
      categoryId: c.id,
      systemeId: 'dnd-classic',
      type: 'personnage',
    });
    expect(m.categoryId).toBe(c.id);
    await ok(mj, 'DELETE', `${base}/npc-template-categories/${c.id}`);
    const [reste] = (await ok(mj, 'GET', `${base}/npc-templates`)) as unknown as Row[];
    expect(reste).toMatchObject({ id: m.id, categoryId: null, version: 2 });

    const ev = await evenements(c.id);
    expect(ev.map((e) => [e.type, e.visibility])).toEqual([
      ['npc_template.category_created', 'gm_only'],
      ['npc_template.category_updated', 'gm_only'],
      ['npc_template.category_deleted', 'gm_only'],
    ]);
    expect(ev[1]!.payload.changes).toEqual([
      { path: 'name', before: 'Rencontre #1', after: 'Gobelins' },
    ]);
    expect(ev[2]!.payload.detachedTemplateIds).toEqual([m.id]);
  });

  it('modèles d’objets : création, modification, suppression', async () => {
    const x = await ok(mj, 'POST', `${base}/object-templates`, {
      name: 'Caisse en bois',
      imageUrl: 'https://exemple.test/caisse.png',
      category: 'custom',
    });
    const y = await ok(mj, 'PATCH', `${base}/object-templates/${x.id}`, {
      version: 1,
      imageUrl: null,
    });
    expect(y).toMatchObject({ version: 2, imageUrl: null, category: 'custom' });
    expect((await o.requete(joueur, 'DELETE', `${base}/object-templates/${x.id}`)).statusCode).toBe(
      403,
    );
    await ok(mj, 'DELETE', `${base}/object-templates/${x.id}`);
    const ev = await evenements(x.id);
    expect(ev.map((e) => e.type)).toEqual([
      'object_template.created',
      'object_template.updated',
      'object_template.deleted',
    ]);
    expect(ev[1]!.payload.changes).toEqual([
      { path: 'imageUrl', before: 'https://exemple.test/caisse.png', after: null },
    ]);
  });
});
