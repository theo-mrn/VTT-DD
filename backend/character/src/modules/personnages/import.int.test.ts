/**
 * Import d'une fiche par HTTP (docs/import-fiche.md § 5) : la fiche Noobliés de référence,
 * vérifiée par le joueur, devient un personnage D&D classique terminé, marqué importé, avec ses
 * écarts aux règles.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
type Utilisateur = Awaited<ReturnType<Contexte['utilisateur']>>;
interface Personnage {
  id: string;
  nom: string;
  etat: {
    creation: boolean;
    possessions: { entree: string; rang: number; champs: Record<string, unknown> }[];
    journal: { objet: string }[];
    entrees: { id: string }[];
  };
  fiche: { valeurs: Record<string, { valeur: unknown }> };
  details: { appearance: string; backstory: string };
  sheetImport: { at: string; source: { kind: string; site?: string }; ecarts: string[] } | null;
}

const source = {
  kind: 'link',
  site: 'nooblieeschroniques.fr',
  url: 'https://nooblieeschroniques.fr/index.php?sheet=exemple',
};

const demande = {
  systemeId: 'dnd-classic',
  type: 'personnage',
  nom: 'Askel Hendriksen',
  details: { appearance: '1,92 m, 102 Kg, 21 ans', backstory: 'Né dans les montagnes du nord.' },
  valeurs: { FOR: 16, DEX: 10, CON: 15, INT: 10, SAG: 13, CHA: 11, niveau: 1, PV: 14 },
  possessions: [
    { entree: 'humain' },
    { entree: 'barbare' },
    { entree: 'barbare-brute', rang: 2 },
    { entree: 'barbare-rage', rang: 0 },
    // Rang 1 de trop : 2 points au niveau 1, tous dépensés dans la voie de la brute
    { entree: 'race-humain', rang: 1 },
  ],
  lues: { PV_Max: 14, Defense: 10 },
  source,
};

describe.skipIf(!TEST_DATABASE_URL)('import d’une fiche par HTTP', () => {
  let t: Contexte;
  let alice: Utilisateur;
  beforeEach(async () => {
    t = await appDeTest();
    alice = await t.utilisateur();
  });
  afterEach(async () => t.fermer());

  const importer = (corps: object) =>
    t.app.inject({
      method: 'POST',
      url: '/v1/characters/import',
      headers: alice.auth,
      payload: corps,
    });

  it('crée le personnage terminé, rangs rejoués, écarts gardés', async () => {
    const res = await importer(demande);
    expect(res.statusCode, res.body).toBe(201);
    const p = res.json() as Personnage;
    expect(p.nom).toBe('Askel Hendriksen');
    expect(p.etat.creation).toBe(false);
    expect(p.fiche.valeurs.FOR!.valeur).toBe(16);
    // Jet de dé de vie retrouvé par le PV max de la fiche : plus d'écart sur les PV
    expect(p.fiche.valeurs.PV_Max!.valeur).toBe(14);
    expect(p.sheetImport?.ecarts.some((e) => e.startsWith('PV max'))).toBe(false);
    const rang = (id: string) => p.etat.possessions.find((x) => x.entree === id)?.rang;
    expect(rang('barbare-brute')).toBe(2);
    expect(rang('race-humain')).toBe(1);
    // Rangs achetés au journal : les points de capacité sont dépensés
    expect(p.etat.journal.map((l) => l.objet)).toEqual(['barbare-brute', 'barbare-brute']);
    expect(p.details.backstory).toBe('Né dans les montagnes du nord.');
    expect(p.sheetImport?.source.site).toBe('nooblieeschroniques.fr');
    expect(p.sheetImport?.ecarts.some((e) => e.startsWith('Voie de l’humain, rang 1'))).toBe(true);
    // Valeurs lues comparées au calcul
    expect(p.sheetImport?.ecarts.some((e) => e.startsWith('Défense : 10 sur la fiche'))).toBe(
      Number(p.fiche.valeurs.Defense!.valeur) !== 10,
    );

    // Relu : la marque d'import reste
    const relu = (
      await t.app.inject({ method: 'GET', url: `/v1/characters/${p.id}`, headers: alice.auth })
    ).json() as Personnage;
    expect(relu.sheetImport?.ecarts).toEqual(p.sheetImport?.ecarts);
  });

  it('refuse une entrée inconnue ou une valeur calculée saisie', async () => {
    const inconnue = await importer({ ...demande, possessions: [{ entree: 'licorne' }] });
    expect(inconnue.statusCode).toBe(422);
    const calculee = await importer({ ...demande, valeurs: { Defense: 18 } });
    expect(calculee.statusCode).toBe(422);
  });

  it('pose une voie absente du catalogue en voie libre', async () => {
    const res = await importer({
      ...demande,
      possessions: [{ entree: 'humain' }, { entree: 'perso-voie-du-roc', rang: 0 }],
      entrees: [{ id: 'perso-voie-du-roc', sorte: 'voie', nom: 'Voie du roc' }],
    });
    expect(res.statusCode, res.body).toBe(201);
    expect((res.json() as Personnage).etat.entrees.map((e) => e.id)).toEqual(['perso-voie-du-roc']);
  });
});
