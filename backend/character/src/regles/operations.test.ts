/**
 * Opérations sur l'état, sans base : création complète Star Wars et D&D,
 * achats et remboursement, saisie des valeurs, possessions, repos, actions.
 */
import { HttpError } from '@vtt/platform';
import {
  aleatoireGraine,
  aleatoireImpose,
  calculer,
  charger,
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
  decompterDurees,
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

describe('tirage en attribution libre', () => {
  // D&D dont les caractéristiques se répartissent librement (aucun système de référence ne le fait)
  const libre = (() => {
    const doc = structuredClone(catalogue.documents('dnd-classic')!.systeme) as unknown as {
      creation: { etapes: { id: string; attribution?: string }[] }[];
    };
    for (const c of doc.creation)
      for (const e of c.etapes) if (e.id === 'caracteristiques') e.attribution = 'libre';
    const r = charger(doc);
    if (!r.ok) throw new Error(r.erreurs[0]?.message);
    return r.systeme;
  })();
  const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'];

  it('tire et garde le tirage en attente, puis le rejoue à l’identique pour le répartir', () => {
    const e = etapes(libre, etatInitial(libre, 'personnage'), [
      ['race', { entrees: [{ entree: 'nain' }] }],
      ['profil', { entrees: [{ entree: 'guerrier' }] }],
    ]);
    const tire = appliquerEtape(libre, e, 'caracteristiques', {}, aleatoireGraine('x'), DATE);
    // Rien d'attribué : le joueur voit les valeurs avant de choisir
    expect(tire.etat).toBe(e);
    expect(tire.enAttente).toMatchObject({ etape: 'caracteristiques' });
    const valeurs = (tire.details.retenu as { valeurs: number[] }).valeurs;
    expect(valeurs).toHaveLength(6);

    // Répartition à l'envers : même tirage, un autre générateur n'y change rien
    const affectation = Object.fromEntries(CARACS.map((c, i) => [c, 5 - i]));
    const reparti = appliquerEtape(
      libre,
      e,
      'caracteristiques',
      { affectation },
      aleatoireGraine('autre'),
      DATE,
      tire.enAttente,
    );
    expect(CARACS.map((c) => reparti.etat.valeurs[c])).toEqual([...valeurs].reverse());
    expect(reparti.enAttente).toBeNull();
    expect(reparti.details).toMatchObject({ repartition: affectation });

    // Une affectation incomplète est refusée par les règles
    expect(
      erreur(() =>
        appliquerEtape(
          libre,
          e,
          'caracteristiques',
          { affectation: { FOR: 0 } },
          aleatoireGraine('x'),
          DATE,
          tire.enAttente,
        ),
      ).status,
    ).toBe(422);
  });
});

describe('valeurs saisies', () => {
  const enJeu = { ...bothan(), creation: false };
  const joueur = { proprietaire: true, mj: false };
  const mj = { proprietaire: false, mj: true };

  it('texte, choix et ressource à tout moment ; base selon sa saisie une fois la création finie', () => {
    const e = modifierValeurs(starWars, enJeu, { nom: 'Kesh', categorie: 'rival', blessures: 3 });
    expect(e.valeurs).toMatchObject({ nom: 'Kesh', categorie: 'rival', blessures: 3 });
    // Crédits (saisie: jeu) : le joueur les saisit en jeu
    expect(modifierValeurs(starWars, enJeu, { credits: 900 }, joueur).valeurs.credits).toBe(900);
    // Vigueur (saisie: creation) : elle s'achète, personne ne la saisit en jeu
    for (const qui of [joueur, mj])
      expect(erreur(() => modifierValeurs(starWars, enJeu, { vigueur: 4 }, qui))).toMatchObject({
        status: 422,
        detail: expect.stringMatching(/Vigueur ne se saisit que pendant la création/),
      });
    expect(modifierValeurs(starWars, bothan(), { vigueur: 1 }).valeurs.vigueur).toBe(1);
  });

  it('XP gagnée (saisie: mj) : refusée au joueur en jeu (403), acceptée au MJ', () => {
    expect(erreur(() => modifierValeurs(starWars, enJeu, { xpGagne: 20 }, joueur))).toMatchObject({
      status: 403,
      code: 'saisie_reservee_mj',
      detail: expect.stringMatching(/ne se saisit en jeu que par le MJ/),
    });
    expect(modifierValeurs(starWars, enJeu, { xpGagne: 20 }, mj).valeurs.xpGagne).toBe(20);
    // Pendant la création, le propriétaire saisit tout
    expect(modifierValeurs(starWars, bothan(), { xpGagne: 20 }, joueur).valeurs.xpGagne).toBe(20);
  });

  it('refuse les attributs inconnus ou calculés et les mauvaises natures', () => {
    for (const valeurs of [{ inconnu: 1 }, { encaissement: 5 }, { categorie: 'roi' }, { nom: 3 }]) {
      expect(erreur(() => modifierValeurs(starWars, enJeu, valeurs)).status).toBe(422);
    }
  });
});

describe('possessions et repos', () => {
  const poser = (e: EtatEntite, d: Parameters<typeof poserPossession>[2]) =>
    poserPossession(starWars, e, d).etat;

  it('ajoute, met à jour puis retire une possession', () => {
    let e = poser(bothan(), { entree: 'fusil-blaster' });
    expect(e.possessions.find((p) => p.entree === 'fusil-blaster')).toMatchObject({ actif: true });
    e = poser(e, { entree: 'fusil-blaster', actif: false });
    expect(e.possessions.filter((p) => p.entree === 'fusil-blaster')).toHaveLength(1);
    expect(e.possessions.find((p) => p.entree === 'fusil-blaster')?.actif).toBe(false);
    e = retirerPossession(starWars, e, 'fusil-blaster');
    expect(e.possessions.some((p) => p.entree === 'fusil-blaster')).toBe(false);
    expect(erreur(() => retirerPossession(starWars, e, 'fusil-blaster')).status).toBe(404);
    expect(erreur(() => poser(e, { entree: 'inconnue' })).status).toBe(422);
    // Une seule espèce
    expect(erreur(() => poser(e, { entree: 'wookiee' })).status).toBe(422);
  });

  it('effets propres d’un talent obtenu par un nœud : possession au rang 0, coupes reportées', () => {
    const plus = (valeur: string) => ({
      sur: 'attribut' as const,
      attribut: 'agilite',
      operation: 'ajouter' as const,
      valeur,
    });
    const base: EtatEntite = { ...bothan(), noeuds: { 'arbre-assassin': ['l1c1'] } };
    let e = poser(base, { entree: 'cran', actif: true, effets: [plus('1'), plus('2')] });
    expect(e.possessions.filter((p) => p.entree === 'cran')).toMatchObject([
      { rang: 0, effets: [plus('1'), plus('2')] },
    ]);
    const f = verifierEtat(starWars, e).fiche;
    // Le rang vient toujours du nœud ; la possession ne porte que les bonus
    expect(f.possessions.get('cran')?.rang).toBe(1);
    expect(f.valeurs.get('agilite')?.detail.map((l) => l.source)).toContain('cran#exemplaire');
    // Retrait du premier bonus : le second, coupé, le reste à sa nouvelle position
    e = poser(
      { ...e, effetsDesactives: ['cran#exemplaire/1'] },
      { entree: 'cran', effets: [plus('2')] },
    );
    expect(e.effetsDesactives).toEqual(['cran#exemplaire/0']);
    e = poser(e, { entree: 'cran', effets: [] });
    expect(e.effetsDesactives).toEqual([]);
  });

  it('exemplaires : un second pistolet avec ses effets, chacun visé par son identifiant', () => {
    const bonusAgilite = [
      {
        sur: 'attribut' as const,
        attribut: 'agilite',
        operation: 'ajouter' as const,
        valeur: '1',
      },
    ];
    let e = poser(bothan(), { entree: 'pistolet-blaster' });
    // Sans « nouveau », la même demande vise l'exemplaire sans identifiant : pas de doublon
    e = poser(e, { entree: 'pistolet-blaster' });
    expect(e.possessions.filter((p) => p.entree === 'pistolet-blaster')).toHaveLength(1);

    const second = poserPossession(starWars, e, {
      entree: 'pistolet-blaster',
      nouveau: true,
      effets: bonusAgilite,
    });
    expect(second).toMatchObject({ exemplaire: '2', cree: true });
    e = second.etat;
    const nomme = poserPossession(starWars, e, {
      entree: 'pistolet-blaster',
      nouveau: true,
      exemplaire: 'fetiche',
    });
    expect(nomme).toMatchObject({ exemplaire: 'fetiche', cree: true });
    e = nomme.etat;
    const pistolets = () => e.possessions.filter((p) => p.entree === 'pistolet-blaster');
    expect(pistolets().map((p) => [p.exemplaire, p.effets.length])).toEqual([
      [undefined, 0],
      ['2', 1],
      ['fetiche', 0],
    ]);
    const f = verifierEtat(starWars, e).fiche;
    expect(f.erreurs).toEqual([]);
    expect(f.sources.map((s) => s.id)).toContain('pistolet-blaster#2');

    // Mise à jour d'un exemplaire précis : les autres ne bougent pas
    e = poser(e, { entree: 'pistolet-blaster', exemplaire: '2', actif: false });
    expect(pistolets().map((p) => p.actif)).toEqual([true, false, true]);
    e = poser(e, { entree: 'pistolet-blaster', actif: false });
    expect(pistolets().map((p) => p.actif)).toEqual([false, false, true]);

    // Retrait d'un exemplaire précis, puis de celui sans identifiant
    e = retirerPossession(starWars, e, 'pistolet-blaster', '2');
    expect(pistolets().map((p) => p.exemplaire)).toEqual([undefined, 'fetiche']);
    e = retirerPossession(starWars, e, 'pistolet-blaster');
    expect(pistolets().map((p) => p.exemplaire)).toEqual(['fetiche']);
    expect(erreur(() => retirerPossession(starWars, e, 'pistolet-blaster'))).toMatchObject({
      status: 404,
      detail: expect.stringMatching(/aucun exemplaire sans identifiant.*fetiche/),
    });
    // Sans identifiant ni « nouveau » : l'exemplaire sans identifiant est recréé
    e = poser(e, { entree: 'pistolet-blaster' });
    expect(pistolets().map((p) => p.exemplaire)).toEqual(['fetiche', undefined]);
  });

  it('exemplaires : refus clairs', () => {
    const e = poser(bothan(), { entree: 'pistolet-blaster' });
    expect(
      erreur(() => poser(e, { entree: 'pistolet-blaster', exemplaire: 'absent', actif: false })),
    ).toMatchObject({ status: 404, detail: expect.stringMatching(/« absent » introuvable/) });
    const deux = poser(e, { entree: 'pistolet-blaster', nouveau: true, exemplaire: 'b' });
    expect(
      erreur(() => poser(deux, { entree: 'pistolet-blaster', nouveau: true, exemplaire: 'b' })),
    ).toMatchObject({ status: 422, code: 'exemplaire_existant' });
    // Espèce : une seule possession, pas d'exemplaires
    expect(erreur(() => poser(e, { entree: 'bothan', exemplaire: 'x' }))).toMatchObject({
      status: 422,
      code: 'exemplaires_refuses',
    });
    expect(erreur(() => poser(e, { entree: 'bothan', nouveau: true }))).toMatchObject({
      status: 422,
      code: 'exemplaires_refuses',
    });
  });

  it('quantités : stimpacks comptés, refusées pour une sorte sans quantités', () => {
    let e = poser(bothan(), { entree: 'stimpack', quantite: 3 });
    expect(e.possessions.find((p) => p.entree === 'stimpack')?.quantite).toBe(3);
    e = poser(e, { entree: 'stimpack', quantite: 5 });
    expect(e.possessions.filter((p) => p.entree === 'stimpack').map((p) => p.quantite)).toEqual([
      5,
    ]);
    expect(verifierEtat(starWars, e).fiche.possessions.get('stimpack')?.quantite).toBe(5);
    expect(erreur(() => poser(e, { entree: 'pistolet-blaster', quantite: 2 }))).toMatchObject({
      status: 422,
      code: 'quantite_refusee',
      detail: expect.stringMatching(/ne se possède pas en quantité/),
    });
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
      parametres: { score: 'Contact', arme: 'epee-longue' },
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

  it('formule propre en clés nues : normalisée comme au lanceur avant l’évaluation', () => {
    const base = nain().etat;
    const avec = (degats: string) =>
      poserPossession(dnd, base, { entree: 'epee-longue', champs: { degats } }).etat;
    const nue = avec('1d6-CON+8');
    // La formule saisie est celle qui est enregistrée
    expect(nue.possessions.find((p) => p.entree === 'epee-longue')?.champs.degats).toBe(
      '1d6-CON+8',
    );
    const degats = (etat: EtatEntite) =>
      resoudreAction(dnd, {
        action: 'attaque',
        acteur: calculer(dnd, etat),
        cible: nain(),
        parametres: { score: 'Contact', arme: 'epee-longue' },
        appliquer: false,
        aleatoire: aleatoireImpose([14, 4]),
      }).resultat.variables.degats;
    // CON nu vaut son apport au jet (le modificateur), comme au lanceur de dés
    expect(degats(nue)).toBe(degats(avec('1d6-mod(@CON)+8')));
    expect(degats(nue)).not.toBe(degats(avec('1d6-@CON+8')));
    expect(erreur(() => avec('1d6-CONS+8'))).toMatchObject({
      status: 422,
      code: 'champs_invalides',
      detail: expect.stringMatching(/« CONS » n’est pas un attribut du personnage/),
    });
  });

  it('ajout configuré en une écriture : nom, formule, bonus, dossier, caché, rangé', () => {
    const etat = { ...nain().etat, folders: [{ id: 'sac', name: 'Sac à dos' }] };
    const bonus = {
      sur: 'attribut' as const,
      attribut: 'Defense',
      operation: 'ajouter' as const,
      valeur: '1',
    };
    const r = poserPossession(dnd, etat, {
      entree: 'epee-longue',
      nouveau: true,
      champs: { nom: 'Orcrist', degats: '1d10+FOR' },
      effets: [bonus],
      actif: false,
      hidden: true,
      folder: 'sac',
    });
    expect(r.cree).toBe(true);
    expect(r.etat.possessions.filter((p) => p.entree === 'epee-longue').at(-1)).toMatchObject({
      exemplaire: '2',
      actif: false,
      hidden: true,
      folder: 'sac',
      champs: { nom: 'Orcrist', degats: '1d10+FOR' },
      effets: [bonus],
    });
    expect(
      erreur(() =>
        poserPossession(dnd, etat, { entree: 'epee-longue', nouveau: true, folder: 'x' }),
      ),
    ).toMatchObject({ status: 422, code: 'dossier_inconnu' });
  });

  it('refuse une action inconnue ou sans sa cible', () => {
    const acteur = nain();
    const essai = (action: string) => () =>
      resoudreAction(dnd, { action, acteur, appliquer: false, aleatoire: aleatoireImpose([10]) });
    expect(erreur(essai('inconnue'))).toMatchObject({ status: 422, code: 'action_refusee' });
    expect(erreur(essai('attaque'))).toMatchObject({ status: 422, code: 'action_refusee' });
  });

  it('initiative : clés de tri du système en plus du résultat', () => {
    const r = resoudreAction(dnd, {
      action: 'initiative',
      acteur: nain(),
      appliquer: false,
      aleatoire: aleatoireImpose([14]),
    });
    expect(r.cles).toEqual([(r.resultat.jet as { total: number }).total]);
    expect(r.cles![0]).toBeGreaterThanOrEqual(14);
    // Une autre action n'a pas de clés
    const test = resoudreAction(dnd, {
      action: 'attaque',
      acteur: nain(),
      cible: nain(),
      parametres: { score: 'Contact', arme: 'epee-longue' },
      appliquer: false,
      aleatoire: aleatoireImpose([10, 1]),
    });
    expect(test.cles).toBeUndefined();
  });
});

describe('durées', () => {
  it('fin de round : -1 round, retrait à 0, possessions sans durée intactes', () => {
    const etat = verifierEtat(dnd, {
      type: 'personnage',
      systeme: { id: 'dnd-classic', version: dnd.source.version },
      possessions: [
        { entree: 'nain' },
        { entree: 'aveugle', duree: 1 },
        { entree: 'effraye', duree: 3 },
      ],
    }).etat;
    const r = decompterDurees(etat);
    expect(r.retirees).toEqual(['aveugle']);
    expect(r.etat!.possessions.map((p) => [p.entree, p.duree])).toEqual([
      ['nain', undefined],
      ['effraye', 2],
    ]);
    expect(etat.possessions).toHaveLength(3);
    expect(decompterDurees(verifierEtat(dnd, { ...etat, possessions: [] }).etat)).toEqual({
      retirees: [],
    });
  });

  it('exemplaires : chacun décompte sa durée, le retrait vise l’exemplaire exact', () => {
    const etat = verifierEtat(starWars, {
      ...bothan(),
      possessions: [
        ...bothan().possessions,
        { entree: 'pistolet-blaster', duree: 3 },
        { entree: 'pistolet-blaster', exemplaire: '2', duree: 1 },
      ],
    }).etat;
    const r = decompterDurees(etat);
    expect(r.retirees).toEqual(['pistolet-blaster#2']);
    expect(
      r
        .etat!.possessions.filter((p) => p.entree === 'pistolet-blaster')
        .map((p) => [p.exemplaire, p.duree]),
    ).toEqual([[undefined, 2]]);
  });

  it('décompte aussi les bonus libres à durée', () => {
    const effets = [
      { sur: 'attribut' as const, attribut: 'FOR', operation: 'ajouter' as const, valeur: '2' },
    ];
    const etat = verifierEtat(dnd, {
      ...etatInitial(dnd, 'personnage'),
      bonus: [
        { id: 'benediction', nom: 'Bénédiction', effets, actif: true, duree: 1 },
        { id: 'rage', nom: 'Rage', effets, actif: true, duree: 3 },
        { id: 'anneau', nom: 'Anneau', effets, actif: true },
      ],
    }).etat;
    const r = decompterDurees(etat);
    expect(r.retirees).toEqual(['bonus:benediction']);
    expect(r.etat!.bonus.map((b) => [b.id, b.duree])).toEqual([
      ['rage', 2],
      ['anneau', undefined],
    ]);
  });
});
