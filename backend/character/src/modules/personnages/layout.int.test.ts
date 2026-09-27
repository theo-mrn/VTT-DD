/**
 * Mise en page de la fiche (`PUT /v1/characters/:id/layout`) et droits renvoyés par la
 * lecture (`permissions`) : propriétaire et MJ de la table la changent, avec la version ;
 * les joueurs de la table la lisent ; l'événement `character.layout_changed` est annoncé
 * à la table.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type PersonnageApi, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

interface AvecMiseEnPage extends PersonnageApi {
  sheetLayout: unknown;
  permissions?: { write: boolean; layout: boolean };
}

/** Mise en page valide : deux blocs, positions sur grand écran seulement. */
const MISE_EN_PAGE = {
  format: 1,
  blocks: [
    {
      id: 'b1',
      type: 'attributs',
      title: 'Caractéristiques',
      params: { groupe: 'caracteristiques', colonnes: 6 },
    },
    {
      id: 'b2',
      type: 'ressources',
      title: 'Vitalité',
      params: { attributs: ['PV'] },
      height: 'fixed',
    },
  ],
  layouts: {
    lg: [
      { i: 'b1', x: 0, y: 0, w: 8, h: 4 },
      { i: 'b2', x: 8, y: 0, w: 4, h: 4 },
    ],
  },
};

/** Même mise en page au format 2 (pas de 4 px) : hauteurs et ordonnées plus grandes. */
const MISE_EN_PAGE_FINE = {
  ...MISE_EN_PAGE,
  format: 2,
  layouts: {
    lg: [
      { i: 'b1', x: 0, y: 0, w: 8, h: 47 },
      { i: 'b2', x: 8, y: 0, w: 4, h: 2_000 },
      { i: 'b3', x: 0, y: 47, w: 12, h: 30 },
    ],
  },
  blocks: [
    ...MISE_EN_PAGE.blocks,
    { id: 'b3', type: 'texte', title: 'Notes', params: { attribut: 'notes' } },
  ],
};

describe.skipIf(!TEST_DATABASE_URL)('mise en page de la fiche', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let proprietaire: Utilisateur;
  let mj: Utilisateur;
  let joueur: Utilisateur;
  let etranger: Utilisateur;
  const campagne = crypto.randomUUID();

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({}, { droits: salles.droits });
    o = outils(t);
    [proprietaire, mj, joueur, etranger] = await Promise.all([
      t.utilisateur(),
      t.utilisateur(),
      t.utilisateur(),
      t.utilisateur(),
    ]);
  });

  afterEach(async () => {
    await t.fermer();
  });

  /** Personnage du propriétaire engagé dans une campagne (MJ : mj, joueur : joueur). */
  async function engage() {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    salles.accorder(p.id, proprietaire.id, {
      lecture: true,
      ecriture: false,
      campagnes: [campagne],
    });
    salles.accorder(p.id, mj.id, {
      lecture: true,
      ecriture: true,
      campagnesMj: [campagne],
      campagnes: [campagne],
    });
    salles.accorder(p.id, joueur.id, { lecture: true, ecriture: false, campagnes: [campagne] });
    return p;
  }

  async function evenements(id: string) {
    return (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          sql`${outbox.envelope}->'aggregate'->>'id' = ${id} and ${outbox.envelope}->>'type' = 'character.layout_changed'`,
        )
        .orderBy(outbox.id)
    ).map((e) => e.envelope as Record<string, unknown>);
  }

  it('la lecture renvoie la mise en page (null par défaut) et les droits de l’appelant', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}`;
    const lu = (await o.ok(proprietaire, 'GET', u)) as AvecMiseEnPage;
    expect(lu.sheetLayout).toBeNull();
    expect(lu.permissions).toEqual({ write: true, layout: true });
    expect(((await o.ok(mj, 'GET', u)) as AvecMiseEnPage).permissions).toEqual({
      write: true,
      layout: true,
    });
    expect(((await o.ok(joueur, 'GET', u)) as AvecMiseEnPage).permissions).toEqual({
      write: false,
      layout: false,
    });
  });

  it('le propriétaire enregistre puis réinitialise sa mise en page, annoncée à la table', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}`;
    const enregistre = (await o.ok(proprietaire, 'PUT', `${u}/layout`, {
      version: p.version,
      layout: MISE_EN_PAGE,
    })) as AvecMiseEnPage;
    expect(enregistre.version).toBe(p.version + 1);
    expect(enregistre.sheetLayout).toEqual(MISE_EN_PAGE);
    expect(enregistre.permissions).toEqual({ write: true, layout: true });
    // Les joueurs de la table lisent la même fiche
    expect(((await o.ok(joueur, 'GET', u)) as AvecMiseEnPage).sheetLayout).toEqual(MISE_EN_PAGE);

    const reinitialise = (await o.ok(proprietaire, 'PUT', `${u}/layout`, {
      version: enregistre.version,
      layout: null,
    })) as AvecMiseEnPage;
    expect(reinitialise.sheetLayout).toBeNull();

    const [avant, apres] = await evenements(p.id);
    expect(avant).toMatchObject({
      roomId: campagne,
      visibility: 'public',
      actor: { userId: proprietaire.id, role: 'user', characterId: p.id },
      payload: { version: p.version + 1, reset: false, blocks: 2 },
    });
    expect(apres).toMatchObject({ payload: { version: p.version + 2, reset: true, blocks: 0 } });
  });

  it('accepte le format 2, au pas vertical fin', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Fin');
    const enregistre = (await o.ok(proprietaire, 'PUT', `/v1/characters/${p.id}/layout`, {
      version: p.version,
      layout: MISE_EN_PAGE_FINE,
    })) as AvecMiseEnPage;
    expect(enregistre.sheetLayout).toEqual(MISE_EN_PAGE_FINE);
  });

  it('hors campagne, l’événement reste celui du propriétaire', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Solitaire');
    await o.ok(proprietaire, 'PUT', `/v1/characters/${p.id}/layout`, {
      version: p.version,
      layout: MISE_EN_PAGE,
    });
    const [e] = await evenements(p.id);
    expect(e).toMatchObject({ roomId: null, visibility: 'owner' });
  });

  it('le MJ la change ; un joueur de la table ne le peut pas ; un étranger ne la voit pas', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}/layout`;
    const parMj = (await o.ok(mj, 'PUT', u, {
      version: p.version,
      layout: MISE_EN_PAGE,
    })) as AvecMiseEnPage;
    expect(parMj.sheetLayout).toEqual(MISE_EN_PAGE);
    const [e] = await evenements(p.id);
    expect(e).toMatchObject({ roomId: campagne, actor: { userId: mj.id, role: 'gm' } });

    const refus = await o.requete(joueur, 'PUT', u, { version: parMj.version, layout: null });
    expect(refus.statusCode).toBe(403);
    const inconnu = await o.requete(etranger, 'PUT', u, { version: parMj.version, layout: null });
    expect(inconnu.statusCode).toBe(404);
  });

  it('une version périmée est refusée (409), rien n’est écrasé', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}`;
    await o.ok(mj, 'PATCH', u, { version: p.version, nom: 'Thorin II' });
    const res = await o.requete(proprietaire, 'PUT', `${u}/layout`, {
      version: p.version,
      layout: MISE_EN_PAGE,
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { code: string }).code).toBe('version_perimee');
    expect(((await o.ok(proprietaire, 'GET', u)) as AvecMiseEnPage).sheetLayout).toBeNull();
  });

  it('refuse une mise en page mal formée, incohérente ou trop volumineuse', async () => {
    const p = await engage();
    const u = `/v1/characters/${p.id}/layout`;
    const invalides: [string, unknown][] = [
      ['format inconnu', { ...MISE_EN_PAGE, format: 3 }],
      ['clé en trop', { ...MISE_EN_PAGE, theme: 'sombre' }],
      [
        'bloc en double',
        { ...MISE_EN_PAGE, blocks: [MISE_EN_PAGE.blocks[0], MISE_EN_PAGE.blocks[0]] },
      ],
      [
        'position d’un bloc inconnu',
        { ...MISE_EN_PAGE, layouts: { lg: [{ i: 'zz', x: 0, y: 0, w: 4, h: 4 }] } },
      ],
      [
        'hors de la grille',
        { ...MISE_EN_PAGE, layouts: { md: [{ i: 'b1', x: 10, y: 0, w: 4, h: 4 }] } },
      ],
      ['largeur inconnue', { ...MISE_EN_PAGE, layouts: { xxl: [] } }],
      [
        'mode de hauteur inconnu',
        { ...MISE_EN_PAGE, blocks: [{ ...MISE_EN_PAGE.blocks[0], height: 'grande' }] },
      ],
      [
        'paramètre invalide',
        {
          ...MISE_EN_PAGE,
          blocks: [{ id: 'b1', type: 'attributs', title: 'X', params: { a: {} } }],
        },
      ],
      // ~40 Ko : sous la limite du corps, au-delà de celle de la mise en page
      ['trop volumineuse', volumineuse(12)],
    ];
    for (const [cas, layout] of invalides) {
      const res = await o.requete(proprietaire, 'PUT', u, { version: p.version, layout });
      expect(res.statusCode, cas).toBe(400);
    }
    // ~130 Ko : refusée avant toute validation
    const enorme = await o.requete(proprietaire, 'PUT', u, {
      version: p.version,
      layout: volumineuse(40),
    });
    expect(enorme.statusCode).toBe(413);
    // Sans version : refusé aussi
    expect((await o.requete(proprietaire, 'PUT', u, { layout: null })).statusCode).toBe(400);
    expect(
      ((await o.ok(proprietaire, 'GET', `/v1/characters/${p.id}`)) as AvecMiseEnPage).version,
    ).toBe(p.version);
  });
});

/** Mise en page valide par sa forme, de `n` blocs aux paramètres les plus longs possible. */
function volumineuse(n: number) {
  return {
    format: 1,
    blocks: Array.from({ length: n }, (_, i) => ({
      id: `b${i}`,
      type: 'possessions',
      title: 'x'.repeat(200),
      params: Object.fromEntries(Array.from({ length: 16 }, (_, k) => [`p${k}`, 'y'.repeat(200)])),
    })),
    layouts: {},
  };
}
