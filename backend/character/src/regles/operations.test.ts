/**
 * Opérations sur l'état, sans base : création complète Star Wars et D&D,
 * achats et remboursement, saisie des valeurs, possessions, repos, actions.
 */
import { HttpError } from '@vtt/platform';
import {
  aleatoireGraine,
  aleatoireImpose,
  calculer,
  etapesCreation,
  solde,
  type EtatEntite,
  type SystemeCharge,
} from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { catalogueReference } from './catalogue.js';
import {
  acheterObjet,
  appliquerEtape,
  etatInitial,
  modifierValeurs,
  poserPossession,
  rembourserLigne,
  reposer,
  resoudreAction,
  retirerPossession,
  terminer,
  verifierEtat,
} from './operations.js';

const catalogue = catalogueReference();
const starWars = catalogue.charge('star-wars-eote')!;
const dnd = catalogue.charge('dnd-classic')!;
const DATE = '2026-09-26T10:00:00.000Z';

/** Enchaîne des étapes de création, en échouant au premier refus. */
function etapes(
  systeme: SystemeCharge,
  depart: EtatEntite,
  suite: [string, Record<string, unknown>][],
  graine = 'graine',
): EtatEntite {
  return suite.reduce(
    (etat, [etape, corps]) =>
      appliquerEtape(systeme, etat, etape, corps, aleatoireGraine(graine), DATE).etat,
    depart,
  );
}

/** Code HTTP et code d'erreur levés par une opération. */
function erreur(fn: () => unknown): { status: number; code?: string; detail?: string } {
  try {
    fn();
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, code: e.code, detail: e.detail };
    throw e;
  }
  throw new Error('aucune erreur levée');
}

/** Bothan chasseur de primes (Assassin), espèce et carrière choisies. */
function bothan(): EtatEntite {
  return etapes(starWars, etatInitial(starWars, 'personnage'), [
    ['espece', { entrees: [{ entree: 'bothan' }] }],
    [
      'carriere',
      {
        entrees: [
          {
            entree: 'chasseur-de-primes',
            choix: {
              'rangs-de-depart': ['athletisme', 'perception', 'distance-lourde', 'vigilance'],
            },
          },
        ],
      },
    ],
    [
      'specialisation',
      {
        entrees: [
          { entree: 'assassin', choix: { 'rangs-de-depart': ['discretion', 'magouilles'] } },
        ],
      },
    ],
  ]);
}

describe('création Star Wars', () => {
  it('état initial en création, type vérifié', () => {
    const e = etatInitial(starWars, 'personnage');
    expect(e).toMatchObject({
      type: 'personnage',
      systeme: { id: 'star-wars-eote', version: starWars.source.version },
      creation: true,
    });
    expect(erreur(() => etatInitial(starWars, 'dragon'))).toMatchObject({
      status: 422,
      code: 'type_inconnu',
    });
  });

  it('espèce, carrière, XP, profil puis fin de création', () => {
    let e = bothan();
    expect(calculer(starWars, e).possessions.get('distance-lourde')?.rang).toBe(1);

    e = acheterObjet(starWars, e, { achat: 'caracteristique', objet: 'agilite' }, DATE).etat;
    e = appliquerEtape(
      starWars,
      e,
      'experience',
      { achat: 'rang-competence', objet: 'distance-lourde' },
      aleatoireGraine('x'),
      DATE,
    ).etat;
    expect(e.journal).toHaveLength(2);
    expect(e.journal[0]).toMatchObject({ achat: 'caracteristique', objet: 'agilite', date: DATE });
    expect(calculer(starWars, e).possessions.get('distance-lourde')?.rang).toBe(2);

    // Création inachevée : le profil reste à saisir
    expect(erreur(() => terminer(starWars, e))).toMatchObject({ status: 422 });

    e = etapes(starWars, e, [
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
    expect(etapesCreation(starWars, e).every((x) => x.statut === 'faite')).toBe(true);
    const fini = terminer(starWars, e);
    expect(fini.creation).toBe(false);
    expect(solde(calculer(starWars, fini), 'xp')).toBe(100 - 30 - 10);
    expect(verifierEtat(starWars, fini).fiche.erreurs).toEqual([]);
  });

  it('achat puis remboursement : l’XP revient', () => {
    const depart = bothan();
    const xp = (e: EtatEntite) => solde(calculer(starWars, e), 'xp');
    const achete = acheterObjet(
      starWars,
      depart,
      { achat: 'caracteristique', objet: 'agilite' },
      DATE,
    );
    expect(xp(achete.etat)).toBe(xp(depart) - 30); // Agilité 2 → 3
    const rembourse = rembourserLigne(starWars, achete.etat, 0);
    expect(rembourse.etat.journal).toEqual([]);
    expect(xp(rembourse.etat)).toBe(xp(depart));
    expect(erreur(() => rembourserLigne(starWars, depart, 3))).toMatchObject({ status: 422 });
  });

  it('refus des règles : étape inconnue, corps invalide, carrière inconnue', () => {
    const e = etatInitial(starWars, 'personnage');
    const essai = (etape: string, corps: unknown) => () =>
      appliquerEtape(starWars, e, etape, corps, aleatoireGraine('x'), DATE);
    expect(erreur(essai('inconnue', {}))).toMatchObject({ status: 404 });
    expect(erreur(essai('espece', { entrees: 'bothan' }))).toMatchObject({
      status: 400,
      code: 'validation_failed',
    });
    expect(erreur(essai('carriere', { entrees: [{ entree: 'bothan' }] }))).toMatchObject({
      status: 422,
    });
  });
});

describe('création D&D', () => {
  it('race, profil, voie, caractéristiques et dé de vie tirés par le serveur', () => {
    let e = etapes(dnd, etatInitial(dnd, 'personnage'), [
      ['race', { entrees: [{ entree: 'nain' }] }],
      ['profil', { entrees: [{ entree: 'guerrier' }] }],
      ['voies', { entrees: [{ entree: 'guerrier-resistance' }] }],
    ]);
    const tirage = appliquerEtape(dnd, e, 'caracteristiques', {}, aleatoireGraine('a'), DATE);
    e = tirage.etat;
    const valeurs = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((c) => e.valeurs[c]);
    expect(valeurs.every((v) => typeof v === 'number' && v >= 3 && v <= 18)).toBe(true);
    expect(tirage.details).toMatchObject({ essais: 1 });
    expect((tirage.details.retenu as { valeurs: number[] }).valeurs).toHaveLength(6);

    e = appliquerEtape(dnd, e, 'de-de-vie', {}, aleatoireImpose([7]), DATE).etat;
    expect(e.valeurs.jetsDeVie).toBe(7);
    const fini = terminer(dnd, e);
    expect(fini.creation).toBe(false);
    // Ressources fixées à leur valeur initiale à la fin de la création
    expect(fini.valeurs.PV).toBe(calculer(dnd, fini).valeurs.get('PV')?.max);
  });
});

describe('valeurs saisies', () => {
  const enJeu = { ...bothan(), creation: false };

  it('texte, choix et ressource à tout moment ; base seulement à la création', () => {
    const e = modifierValeurs(starWars, enJeu, { nom: 'Kesh', categorie: 'rival', blessures: 3 });
    expect(e.valeurs).toMatchObject({ nom: 'Kesh', categorie: 'rival', blessures: 3 });
    expect(erreur(() => modifierValeurs(starWars, enJeu, { credits: 900 }))).toMatchObject({
      status: 422,
    });
    expect(modifierValeurs(starWars, bothan(), { credits: 900 }).valeurs.credits).toBe(900);
  });

  it('refuse les attributs inconnus ou calculés et les mauvaises natures', () => {
    for (const valeurs of [{ inconnu: 1 }, { encaissement: 5 }, { categorie: 'roi' }, { nom: 3 }]) {
      expect(erreur(() => modifierValeurs(starWars, enJeu, valeurs)).status).toBe(422);
    }
  });
});

describe('possessions et repos', () => {
  it('ajoute, met à jour puis retire une possession', () => {
    let e = poserPossession(starWars, bothan(), { entree: 'fusil-blaster' });
    expect(e.possessions.find((p) => p.entree === 'fusil-blaster')).toMatchObject({ actif: true });
    e = poserPossession(starWars, e, { entree: 'fusil-blaster', actif: false });
    expect(e.possessions.filter((p) => p.entree === 'fusil-blaster')).toHaveLength(1);
    expect(e.possessions.find((p) => p.entree === 'fusil-blaster')?.actif).toBe(false);
    e = retirerPossession(starWars, e, 'fusil-blaster');
    expect(e.possessions.some((p) => p.entree === 'fusil-blaster')).toBe(false);
    expect(erreur(() => retirerPossession(starWars, e, 'fusil-blaster')).status).toBe(404);
    expect(erreur(() => poserPossession(starWars, e, { entree: 'inconnue' })).status).toBe(422);
    // Une seule espèce
    expect(erreur(() => poserPossession(starWars, e, { entree: 'wookiee' })).status).toBe(422);
  });

  it('repos : les ressources reviennent à leur borne', () => {
    const blesse = modifierValeurs(starWars, { ...bothan(), creation: false }, { blessures: 5 });
    const repose = reposer(calculer(starWars, blesse));
    expect(repose.valeurs.blessures).toBe(0);
    expect(erreur(() => reposer(calculer(starWars, blesse), ['nom'])).status).toBe(422);
  });
});

describe('actions', () => {
  const nain = () =>
    verifierEtat(dnd, {
      type: 'personnage',
      systeme: { id: 'dnd-classic', version: dnd.source.version },
      valeurs: { FOR: 14, DEX: 12, CON: 16, SAG: 10, INT: 8, CHA: 13, niveau: 1, jetsDeVie: 7 },
      possessions: [{ entree: 'nain' }, { entree: 'guerrier' }, { entree: 'epee-longue' }],
    }).fiche;

  it('sans appliquer : résultat seul ; avec appliquer : PV de la cible retirés', () => {
    const acteur = nain();
    const cible = nain();
    const demande = {
      action: 'attaque',
      acteur,
      cible,
      parametres: { arme: 'epee-longue' },
    };
    const seul = resoudreAction(dnd, {
      ...demande,
      appliquer: false,
      aleatoire: aleatoireImpose([20, 6, 6]),
    });
    expect(seul.resultat.reussi).toBe(true);
    expect(seul.acteur).toBeUndefined();
    expect(seul.cible).toBeUndefined();

    const applique = resoudreAction(dnd, {
      ...demande,
      appliquer: true,
      aleatoire: aleatoireImpose([20, 6, 6]),
    });
    const pv = (f: typeof cible) => Number(f.valeur('PV'));
    expect(applique.acteur).toBeUndefined();
    expect(Number(calculer(dnd, applique.cible!).valeur('PV'))).toBeLessThan(pv(cible));
  });

  it('refuse une action inconnue ou sans sa cible', () => {
    const acteur = nain();
    const essai = (action: string) => () =>
      resoudreAction(dnd, { action, acteur, appliquer: false, aleatoire: aleatoireImpose([10]) });
    expect(erreur(essai('inconnue'))).toMatchObject({ status: 422, code: 'action_refusee' });
    expect(erreur(essai('attaque'))).toMatchObject({ status: 422, code: 'action_refusee' });
  });
});
