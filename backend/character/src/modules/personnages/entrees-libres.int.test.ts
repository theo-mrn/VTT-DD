/**
 * Entrées libres par HTTP (docs/entrees-libres.md) : une voie maison et ses capacités posées
 * sur un personnage, possédées, calculées, puis retirées ensemble.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
type Utilisateur = Awaited<ReturnType<Contexte['utilisateur']>>;
interface Personnage {
  id: string;
  version: number;
  etat: { entrees: { id: string }[]; possessions: { entree: string; rang: number }[] };
  fiche: { valeurs: Record<string, { valeur: unknown }> };
}

const capacite = (id: string, nom: string, rangVoie: number, effets: object[] = []) => ({
  id,
  sorte: 'capacite',
  nom,
  champs: { voie: 'perso-voie-du-roc', rangVoie, activation: 'Capacité passive' },
  effets,
});

describe.skipIf(!TEST_DATABASE_URL)('entrées libres par HTTP', () => {
  let t: Contexte;
  let alice: Utilisateur;
  beforeEach(async () => {
    t = await appDeTest();
    alice = await t.utilisateur();
  });
  afterEach(async () => t.fermer());

  const envoyer = (method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    t.app.inject({ method, url, headers: alice.auth, ...(payload ? { payload } : {}) });
  const poser = async (p: Personnage, entries: object[]) => {
    const res = await envoyer('PUT', `/v1/characters/${p.id}/entries`, {
      version: p.version,
      entries,
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json() as Personnage;
  };

  it('pose une voie libre, la calcule au rang possédé, puis la retire avec ses capacités', async () => {
    let p = (
      await envoyer('POST', '/v1/characters', {
        systemeId: 'dnd-classic',
        type: 'personnage',
        nom: 'Aldo',
      })
    ).json() as Personnage;
    const defense = Number(p.fiche.valeurs.Defense!.valeur);

    // La voie et ses capacités se citent : posées ensemble
    p = await poser(p, [
      {
        id: 'perso-voie-du-roc',
        sorte: 'voie',
        nom: 'Voie du roc',
        effets: [
          { sur: 'rang', entree: 'perso-peau-de-pierre', valeur: 1, condition: 'rang >= 1' },
          { sur: 'rang', entree: 'perso-masse', valeur: 1, condition: 'rang >= 2' },
        ],
      },
      capacite('perso-peau-de-pierre', 'Peau de pierre', 1, [
        { sur: 'attribut', attribut: 'Defense', operation: 'ajouter', valeur: 2 },
      ]),
      capacite('perso-masse', 'Masse', 2),
    ]);
    expect(p.etat.entrees.map((e) => e.id)).toEqual([
      'perso-voie-du-roc',
      'perso-peau-de-pierre',
      'perso-masse',
    ]);

    const res = await envoyer('POST', `/v1/characters/${p.id}/possessions`, {
      version: p.version,
      entree: 'perso-voie-du-roc',
      rang: 2,
    });
    expect(res.statusCode, res.body).toBe(200);
    p = res.json() as Personnage;
    expect(p.fiche.valeurs.Defense!.valeur).toBe(defense + 2);

    const sans = (
      await envoyer(
        'DELETE',
        `/v1/characters/${p.id}/entries/perso-voie-du-roc?version=${p.version}`,
      )
    ).json() as Personnage;
    expect(sans.etat.entrees).toEqual([]);
    expect(sans.etat.possessions.some((x) => x.entree.startsWith('perso-'))).toBe(false);
    expect(sans.fiche.valeurs.Defense!.valeur).toBe(defense);
  });

  it('refuse une entrée libre d’une sorte non personnalisable, ou une formule fausse', async () => {
    const p = (
      await envoyer('POST', '/v1/characters', {
        systemeId: 'dnd-classic',
        type: 'personnage',
        nom: 'Aldo',
      })
    ).json() as Personnage;
    const race = await envoyer('PUT', `/v1/characters/${p.id}/entries`, {
      version: p.version,
      entries: [{ id: 'perso-elfe', sorte: 'race', nom: 'Elfe' }],
    });
    expect(race.statusCode).toBe(422);
    expect(race.json().detail).toContain('n’admet pas d’entrée libre');

    const formule = await envoyer('PUT', `/v1/characters/${p.id}/entries`, {
      version: p.version,
      entries: [
        {
          id: 'perso-x',
          sorte: 'capacite',
          nom: 'X',
          effets: [{ sur: 'attribut', attribut: 'SAGESSE', operation: 'ajouter', valeur: 1 }],
        },
      ],
    });
    expect(formule.statusCode).toBe(422);
    expect(formule.json().detail).toContain('SAGESSE');
  });
});
