/**
 * Exemplaires, quantités et saisie en jeu par HTTP : deux dagues dont une à
 * effets propres, stimpacks en quantité, retrait d'un exemplaire précis ;
 * pièces en objets de l'inventaire (plus de bourse), XP gagnée réservée au MJ de la
 * salle (droits de salle simulés, comme les tests de droits).
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type PersonnageApi, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

interface Possession {
  entree: string;
  exemplaire?: string;
  quantite?: number;
  actif: boolean;
  effets: unknown[];
}
type Personnage = PersonnageApi & {
  etat: { possessions: Possession[] };
  fiche: { valeurs: Record<string, { valeur: unknown; detail: { source: string }[] }> };
};

const contactPlus1 = [
  {
    sur: 'attribut',
    attribut: 'Contact',
    operation: 'ajouter',
    valeur: 1,
    description: 'Dague +1',
  },
];

describe.skipIf(!TEST_DATABASE_URL)('exemplaires, quantités et saisie en jeu', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let proprietaire: Utilisateur;
  let mj: Utilisateur;

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({}, { droits: salles.droits });
    o = outils(t);
    [proprietaire, mj] = await Promise.all([t.utilisateur(), t.utilisateur()]);
  });

  afterEach(async () => {
    await t.fermer();
  });

  const url = (p: { id: string }, suite = '') => `/v1/characters/${p.id}${suite}`;
  const dagues = (p: Personnage) => p.etat.possessions.filter((x) => x.entree === 'dague');

  it('deux dagues, dont une à effets propres ; retrait d’un exemplaire précis', async () => {
    let p = (await o.nainGuerrier(proprietaire, 'Thorin')) as Personnage;
    const contact = Number(p.fiche.valeurs.Contact!.valeur);

    p = (await o.ok(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'dague',
    })) as Personnage;
    // Même demande sans « nouveau » : l'exemplaire sans identifiant est mis à jour, pas doublé
    p = (await o.ok(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'dague',
      actif: true,
    })) as Personnage;
    expect(dagues(p)).toHaveLength(1);

    p = (await o.ok(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'dague',
      nouveau: true,
      effets: contactPlus1,
    })) as Personnage;
    expect(dagues(p).map((d) => [d.exemplaire, d.effets.length])).toEqual([
      [undefined, 0],
      ['2', 1],
    ]);
    expect(p.fiche.valeurs.Contact!.valeur).toBe(contact + 1);
    expect(p.fiche.valeurs.Contact!.detail.map((l) => l.source)).toContain('dague#2');

    // L'événement porte l'exemplaire créé
    const [evenement] = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->'aggregate'->>'id' = ${p.id} and ${outbox.envelope}->'payload'->>'cree' = 'true' and ${outbox.envelope}->'payload'->'possession'->>'exemplaire' = '2'`,
      );
    expect(evenement).toBeDefined();

    // Exemplaire inconnu : 404 avec la liste de ceux qui existent
    const inconnu = await o.requete(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'dague',
      exemplaire: '7',
      actif: false,
    });
    expect(inconnu.statusCode).toBe(404);
    expect(inconnu.json().detail).toMatch(
      /« 7 » introuvable.*exemplaires : \(sans identifiant\), 2/,
    );

    // Retrait de la dague +1 seule : l'autre reste, le bonus disparaît
    p = (await o.ok(
      proprietaire,
      'DELETE',
      url(p, `/possessions/dague?exemplaire=2&version=${p.version}`),
    )) as Personnage;
    expect(dagues(p).map((d) => d.exemplaire)).toEqual([undefined]);
    expect(p.fiche.valeurs.Contact!.valeur).toBe(contact);
    const absent = await o.requete(
      proprietaire,
      'DELETE',
      url(p, `/possessions/dague?exemplaire=2&version=${p.version}`),
    );
    expect(absent.statusCode).toBe(404);
  });

  it('stimpacks en quantité ; quantité refusée pour une sorte sans quantités', async () => {
    let p = (await o.chasseurBothan(proprietaire, 'Kesh')) as Personnage;
    p = (await o.ok(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'stimpack',
      quantite: 3,
    })) as Personnage;
    p = (await o.ok(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'stimpack',
      quantite: 5,
    })) as Personnage;
    expect(
      p.etat.possessions.filter((x) => x.entree === 'stimpack').map((x) => x.quantite),
    ).toEqual([5]);

    const refus = await o.requete(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'fusil-blaster',
      quantite: 2,
    });
    expect(refus.statusCode).toBe(422);
    expect(refus.json()).toMatchObject({ code: 'quantite_refusee' });
    expect(refus.json().detail).toMatch(/ne se possède pas en quantité/);
  });

  it('pièces et objet personnalisé dans l’inventaire, plus de bourse ; niveau réservé au MJ', async () => {
    let p = await o.nainGuerrier(proprietaire, 'Thorin');
    const bourse = await o.requete(proprietaire, 'PUT', url(p, '/valeurs'), {
      version: p.version,
      valeurs: { bourse: 50 },
    });
    expect(bourse.statusCode).toBe(422);
    expect(bourse.json().detail).toMatch(/Attribut inconnu : bourse/);
    p = await o.ok(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'piece-d-or',
      quantite: 5,
    });
    p = await o.ok(proprietaire, 'POST', url(p, '/possessions'), {
      version: p.version,
      entree: 'objet-libre',
      nouveau: true,
      quantite: 7,
      champs: { nom: 'Ration journalière', categorie: 'nourriture' },
    });
    expect(
      p.etat.possessions
        .filter((x) => x.entree === 'piece-d-or' || x.entree === 'objet-libre')
        .map((x) => [x.entree, x.quantite]),
    ).toEqual([
      ['piece-d-or', 5],
      ['objet-libre', 7],
    ]);
    const niveau = await o.requete(proprietaire, 'PUT', url(p, '/valeurs'), {
      version: p.version,
      valeurs: { niveau: 2 },
    });
    expect(niveau.statusCode).toBe(403);
    expect(niveau.json()).toMatchObject({ code: 'saisie_reservee_mj' });
  });

  it('passage de niveau par le joueur : niveau, dés de vie et PV suivent', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Balin');
    const niveauAvant = Number(p.etat.valeurs.niveau ?? 1);
    const jetsAvant = Number(p.etat.valeurs.jetsDeVie ?? 0);
    // Le niveau ne se saisit pas à la main par le joueur, mais le passage de niveau lui est ouvert
    const r = await o.requete(proprietaire, 'POST', url(p, '/actions/monter-niveau'), {
      appliquer: true,
    });
    expect(r.statusCode).toBe(200);
    const corps = r.json();
    expect(corps.personnage.etat.valeurs.niveau).toBe(niveauAvant + 1);
    expect(corps.personnage.etat.valeurs.jetsDeVie).toBeGreaterThan(jetsAvant);
  });

  it('XP gagnée : refusée au joueur en jeu, acceptée au MJ de la salle', async () => {
    let p = await o.chasseurBothan(proprietaire, 'Kesh');
    p = await o.etapes(proprietaire, p, [
      [
        'specialisation',
        {
          entrees: [
            { entree: 'assassin', choix: { 'rangs-de-depart': ['discretion', 'magouilles'] } },
          ],
        },
      ],
      ['experience', { achat: 'caracteristique', objet: 'agilite' }],
      [
        'profil',
        {
          valeurs: {
            nom: 'Kesh Vatra',
            categorie: 'pj',
            motivation: 'La prime',
            historique: 'Né sur Bothawui',
            credits: 500,
          },
        },
      ],
    ]);
    p = await o.ok(proprietaire, 'POST', url(p, '/creation/terminer'), { version: p.version });

    const joueur = await o.requete(proprietaire, 'PUT', url(p, '/valeurs'), {
      version: p.version,
      valeurs: { xpGagne: 25 },
    });
    expect(joueur.statusCode).toBe(403);
    expect(joueur.json()).toMatchObject({ code: 'saisie_reservee_mj' });
    expect(joueur.json().detail).toMatch(/ne se saisit en jeu que par le MJ/);

    salles.accorder(p.id, mj.id, { lecture: true, ecriture: true });
    p = await o.ok(mj, 'PUT', url(p, '/valeurs'), { version: p.version, valeurs: { xpGagne: 25 } });
    expect(p.etat.valeurs.xpGagne).toBe(25);

    // Le propriétaire qui mène lui-même une salle où son personnage est engagé est MJ
    salles.accorder(p.id, proprietaire.id, { lecture: true, ecriture: true });
    p = await o.ok(proprietaire, 'PUT', url(p, '/valeurs'), {
      version: p.version,
      valeurs: { xpGagne: 30 },
    });
    expect(p.etat.valeurs.xpGagne).toBe(30);
  });
});
