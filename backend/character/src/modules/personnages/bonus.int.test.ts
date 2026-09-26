/**
 * Bonus libres et effets d'exemplaire par HTTP : vérifiés par le moteur à
 * l'écriture, recalculés dans la fiche renvoyée.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
type Utilisateur = Awaited<ReturnType<Contexte['utilisateur']>>;
interface Personnage {
  id: string;
  version: number;
  etat: {
    bonus: { id: string; nom: string }[];
    possessions: { entree: string; effets: unknown[] }[];
  };
  fiche: { valeurs: Record<string, { valeur: unknown; detail: { source: string }[] }> };
}

describe.skipIf(!TEST_DATABASE_URL)('bonus par HTTP', () => {
  let t: Contexte;
  let alice: Utilisateur;
  beforeEach(async () => {
    t = await appDeTest();
    alice = await t.utilisateur();
  });
  afterEach(async () => t.fermer());

  const envoyer = (method: 'POST' | 'DELETE', url: string, payload?: object) =>
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
});
