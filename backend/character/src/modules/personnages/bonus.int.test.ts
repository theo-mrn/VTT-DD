/**
 * Bonus libres et effets d'exemplaire par HTTP : vérifiés par le moteur à
 * l'écriture, recalculés dans la fiche renvoyée.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
type Utilisateur = Awaited<ReturnType<Contexte['utilisateur']>>;
interface Personnage {
  id: string;
  version: number;
  etat: {
    bonus: { id: string; nom: string }[];
    possessions: { entree: string; actif: boolean; effets: unknown[] }[];
    effetsDesactives: string[];
  };
  fiche: {
    valeurs: Record<string, { valeur: unknown; detail: { source: string; desactive?: boolean }[] }>;
  };
}

describe.skipIf(!TEST_DATABASE_URL)('bonus par HTTP', () => {
  let t: Contexte;
  let alice: Utilisateur;
  beforeEach(async () => {
    t = await appDeTest();
    alice = await t.utilisateur();
  });
  afterEach(async () => t.fermer());

  const envoyer = (method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    t.app.inject({ method, url, headers: alice.auth, ...(payload ? { payload } : {}) });
  const creer = async () =>
    (
      await envoyer('POST', '/v1/characters', {
        systemeId: 'dnd-classic',
        type: 'personnage',
        nom: 'Aldo',
      })
    ).json() as Personnage;

  it('pose un bonus libre, le recalcule, puis le retire', async () => {
    const p = await creer();
    const force = Number(p.fiche.valeurs.FOR!.valeur);
    const res = await envoyer('POST', `/v1/characters/${p.id}/bonus`, {
      version: p.version,
      nom: 'Potion de force',
      source: 'Inventaire',
      effets: [{ sur: 'attribut', attribut: 'FOR', operation: 'ajouter', valeur: 2 }],
    });
    expect(res.statusCode).toBe(200);
    const avec = res.json() as Personnage;
    expect(avec.etat.bonus.map((b) => b.id)).toEqual(['potion-de-force']);
    expect(avec.fiche.valeurs.FOR!.valeur).toBe(force + 2);
    expect(avec.fiche.valeurs.FOR!.detail.map((l) => l.source)).toContain('bonus:potion-de-force');

    const sans = (
      await envoyer(
        'DELETE',
        `/v1/characters/${p.id}/bonus/potion-de-force?version=${avec.version}`,
      )
    ).json() as Personnage;
    expect(sans.etat.bonus).toEqual([]);
    expect(sans.fiche.valeurs.FOR!.valeur).toBe(force);
  });

  it('refuse un bonus invalide avec le détail des erreurs', async () => {
    const p = await creer();
    const res = await envoyer('POST', `/v1/characters/${p.id}/bonus`, {
      version: p.version,
      nom: 'Faux',
      effets: [{ sur: 'attribut', attribut: 'SAGESSE', operation: 'ajouter', valeur: '1d6' }],
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().detail).toContain('Attribut inconnu du porteur : SAGESSE');
  });

  it('pose des effets propres à un exemplaire possédé', async () => {
    const p = await creer();
    const defense = Number(p.fiche.valeurs.Defense!.valeur);
    const res = await envoyer('POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'cuir',
      actif: true,
      effets: [
        {
          sur: 'attribut',
          attribut: 'Defense',
          operation: 'ajouter',
          valeur: 1,
          description: 'Cuir +1',
        },
      ],
    });
    expect(res.statusCode).toBe(200);
    const q = res.json() as Personnage;
    expect(q.fiche.valeurs.Defense!.detail.map((l) => l.source)).toContain('cuir#exemplaire');
    expect(Number(q.fiche.valeurs.Defense!.valeur)).toBeGreaterThan(defense);
  });

  describe('effets activés un à un', () => {
    const evenements = async (id: string) =>
      (
        await t
          .db!.select()
          .from(outbox)
          .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${id}`)
      )
        .map((l) => l.envelope as { type: string; payload: Record<string, unknown> })
        .filter((e) => e.type === 'character.updated' && e.payload.operation === 'effet');

    const equipe = async () => {
      const p = await creer();
      const res = await envoyer('POST', `/v1/characters/${p.id}/possessions`, {
        version: p.version,
        entree: 'cuir',
        actif: true,
      });
      expect(res.statusCode).toBe(200);
      return res.json() as Personnage;
    };
    const basculer = (p: Personnage, effet: string, actif: boolean) =>
      envoyer('PUT', `/v1/characters/${p.id}/effets`, { version: p.version, effet, actif });

    it('coupe l’effet sans déséquiper, idempotent, avec son événement', async () => {
      const p = await equipe();
      const defense = Number(p.fiche.valeurs.Defense!.valeur);
      const res = await basculer(p, 'cuir/0', false);
      expect(res.statusCode).toBe(200);
      const coupe = res.json() as Personnage;
      expect(coupe.etat.effetsDesactives).toEqual(['cuir/0']);
      expect(coupe.etat.possessions.find((x) => x.entree === 'cuir')?.actif).toBe(true);
      expect(Number(coupe.fiche.valeurs.Defense!.valeur)).toBe(defense - 2);
      expect(coupe.fiche.valeurs.Defense!.detail).toContainEqual(
        expect.objectContaining({ source: 'cuir', desactive: true }),
      );

      // Même demande : même état
      const encore = (await basculer(coupe, 'cuir/0', false)).json() as Personnage;
      expect(encore.etat.effetsDesactives).toEqual(['cuir/0']);
      expect(encore.version).toBe(coupe.version + 1);

      const remis = (await basculer(encore, 'cuir/0', true)).json() as Personnage;
      expect(remis.etat.effetsDesactives).toEqual([]);
      expect(Number(remis.fiche.valeurs.Defense!.valeur)).toBe(defense);

      const evts = await evenements(p.id);
      expect(evts.map((e) => [e.payload.actif, e.payload.change])).toEqual([
        [false, true],
        [false, false],
        [true, true],
      ]);
      expect(evts[0]!.payload).toMatchObject({ effet: 'cuir/0', source: 'cuir' });
      expect(evts[0]!.payload.changes).toContainEqual(
        expect.objectContaining({ path: 'etat.effetsDesactives' }),
      );
    });

    it('refuse un effet inconnu, un bonus libre, une version périmée', async () => {
      const p = await equipe();
      expect((await basculer(p, 'cuir/3', false)).statusCode).toBe(404);
      expect((await basculer(p, 'pas une clé', false)).statusCode).toBe(400);
      const avec = (
        await envoyer('POST', `/v1/characters/${p.id}/bonus`, {
          version: p.version,
          nom: 'Potion',
          effets: [{ sur: 'attribut', attribut: 'FOR', operation: 'ajouter', valeur: 2 }],
        })
      ).json() as Personnage;
      const libre = await basculer(avec, 'bonus:potion/0', false);
      expect(libre.statusCode).toBe(422);
      expect((await basculer(p, 'cuir/0', false)).statusCode).toBe(409);
    });

    it('oublie l’effet coupé quand l’objet est retiré', async () => {
      const p = await equipe();
      const coupe = (await basculer(p, 'cuir/0', false)).json() as Personnage;
      const res = await envoyer(
        'DELETE',
        `/v1/characters/${p.id}/possessions/cuir?version=${coupe.version}`,
      );
      expect(res.statusCode).toBe(200);
      expect((res.json() as Personnage).etat.effetsDesactives).toEqual([]);
    });
  });
});
