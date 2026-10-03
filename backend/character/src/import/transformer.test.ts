/**
 * Migration des personnages legacy : personnages construits d'après le code
 * de l'ancienne app (création, achats à l'XP, montée de niveau, inventaire et
 * bonus), migrés puis recalculés avec les vrais systèmes. Valeurs attendues
 * calculées à la main.
 *
 * Lancement : `pnpm --filter @vtt/character exec vitest run src/import`. Les
 * systèmes sont lus depuis leurs sources YAML (`chargerSource` de
 * packages/systemes, importé par chemin relatif : ce n'est pas un export du
 * paquet), pour tester la migration contre le contenu courant.
 */
import { calculer, detailSolde, EtatEntite, type Fiche, type SystemeCharge } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { chargerSource } from '../../../../packages/systemes/src/test-utils.js';
import type {
  BonusLegacy,
  CompetencePersonnaliseeLegacy,
  DocFirestore,
  ObjetInventaireLegacy,
  PersonnageLegacy,
} from './legacy.js';
import { detecterSysteme, transformerPersonnage, type PersonnageMigre } from './transformer.js';

const systemes: Record<string, SystemeCharge> = {
  'star-wars-eote': chargerSource('star-wars-eote'),
  'dnd-classic': chargerSource('dnd-classic'),
  nooblies: chargerSource('nooblies'),
};

const perso = (
  salle: string,
  id: string,
  data: PersonnageLegacy,
): DocFirestore<PersonnageLegacy> => ({
  path: `cartes/${salle}/characters/${id}`,
  id,
  data,
});
let n = 0;
const objet = (
  message: string,
  extra: ObjetInventaireLegacy = {},
): DocFirestore<ObjetInventaireLegacy> => ({
  path: `Inventaire/salle/perso/obj${++n}`,
  id: `obj${n}`,
  data: {
    message,
    category: 'autre',
    quantity: 1,
    visibility: 'public',
    weight: 1,
    bonusTypes: {},
    ...extra,
  },
});
const bonus = (id: string, data: BonusLegacy): DocFirestore<BonusLegacy> => ({
  path: `Bonus/salle/perso/${id}`,
  id,
  data,
});

/** Migre, vérifie que l'état est valide et se calcule sans erreur, renvoie la fiche. */
function migrer(...args: Parameters<typeof transformerPersonnage>): {
  r: PersonnageMigre;
  f: Fiche;
} {
  const r = transformerPersonnage(...args);
  expect(EtatEntite.parse(r.etat)).toEqual(r.etat);
  const f = calculer(systemes[r.etat.systeme.id]!, r.etat);
  expect(f.erreurs).toEqual([]);
  expect(r.avertissements.filter((a) => a.startsWith('Calcul'))).toEqual([]);
  return { r, f };
}
const rang = (f: Fiche, id: string) => f.possessions.get(id)?.rang ?? 0;
const avertit = (r: PersonnageMigre, motif: RegExp) =>
  expect(
    r.avertissements.some((a) => motif.test(a)),
    `${motif} dans ${JSON.stringify(r.avertissements, null, 1)}`,
  ).toBe(true);

// ─── Star Wars ───────────────────────────────────────────────────────────────

/**
 * Bothan chasseur de primes (Assassin), joueur. Création legacy : 110 XP du
 * système + 10 d'Obligation ; Agilité 2→3 (30) et Vigueur 1→2 (20) → 70 XP
 * restants. En jeu : Distance (armes lourdes) 1→2 (10), Cran (5), Visée
 * précise (10), Traqueur (5) → 40 restants, 80 dépensés ; le MJ donne 20 XP.
 */
const bothan = perso('salleSW', 'bothan1', {
  Nomperso: 'Kell Tavar',
  type: 'joueurs',
  imageURL: 'https://cdn.exemple/kell.webp',
  Race: 'bothan',
  Profile: 'bounty_hunter',
  career: 'bounty_hunter',
  careerSkillChoices: ['athletics', 'perception', 'ranged_heavy', 'vigilance'],
  specializations: ['Xk2pQ9aZ'],
  specializationSkillChoices: { Xk2pQ9aZ: ['stealth', 'skulduggery'] },
  skillRanks: {
    athletics: 1,
    perception: 1,
    ranged_heavy: 2,
    vigilance: 1,
    stealth: 1,
    skulduggery: 1,
  },
  unlockedTalents: {
    Xk2pQ9aZ: { 'assassin-grit': 1, 'assassin-precise-aim-1': 1, 'assassin-stalker-1': 1 },
  },
  vigueur: 2,
  agilite: 3,
  intellect: 2,
  ruse: 3,
  volonte: 2,
  presence: 2,
  baseSeuilBlessure: 10,
  baseSeuilStress: 10,
  SeuilBlessure: 12,
  PV_Max: 12,
  PV: 3,
  Stress_Max: 12,
  Stress: 2,
  BlessuresCritiques: 0,
  xp: 60,
  xpSpent: 80,
  Obligations: [{ value: 10, text: 'Prime sur ma tête posée par Jabba' }],
  Background: 'Ancien informateur du réseau bothan.',
  Description: 'Fourrure grise, cicatrice à l’oreille.',
  customFields: [{ id: 'c1', label: 'Réputation', type: 'number', value: 3 }],
  x: 500,
  y: 500,
  visibility: 'visible',
});
const inventaireBothan = [
  objet('Fusil blaster', { category: 'armes_distance_standard', damage: '9', critical: 3 }),
  objet('Armure légère', { category: 'armures' }),
  objet('Stimpack', { category: 'equipement_general', quantity: 3 }),
  objet('Crédit galactique', { category: 'monnaie', quantity: 250 }),
  objet('Tensor Rifle', { category: 'armes_distance_exotiques' }),
  objet('Sabre laser de famille', { category: 'autre' }),
  {
    path: 'Inventaire/salle/perso/dossier',
    id: 'dossier',
    data: { message: 'Butin', isFolder: true },
  },
];

describe('Star Wars : Bothan chasseur de primes avec talents et Obligation', () => {
  const { r, f } = migrer(bothan, {
    systemeId: 'star-wars-eote',
    systemes,
    inventaire: inventaireBothan,
    bonus: [bonus('b1', { vigueur: 1, active: true, category: 'Inventaire', name: 'Stim' })],
  });

  it('identité et origine legacy', () => {
    expect(r.nom).toBe('Kell Tavar');
    expect(r.avatarUrl).toBe('https://cdn.exemple/kell.webp');
    expect(r.legacy).toEqual({ id: 'bothan1', roomId: 'salleSW', type: 'joueurs' });
    expect(r.etat.creation).toBe(false);
    expect(r.etat.valeurs).toMatchObject({
      nom: 'Kell Tavar',
      categorie: 'pj',
      historique: 'Ancien informateur du réseau bothan.',
    });
    expect(r.details).toEqual({ Description: 'Fourrure grise, cicatrice à l’oreille.' });
  });

  it('caractéristiques : l’espèce vient des règles, seuls les achats sont enregistrés', () => {
    // Vigueur 2 + bonus « Stim » +1, ajouté comme l'ancienne fiche le faisait à l'affichage
    expect(
      ['vigueur', 'agilite', 'intellect', 'ruse', 'volonte', 'presence'].map((k) => f.valeur(k)),
    ).toEqual([3, 3, 2, 3, 2, 2]);
    expect(r.etat.valeurs).toMatchObject({
      vigueur: 1,
      agilite: 1,
      intellect: 0,
      ruse: 0,
      volonte: 0,
      presence: 0,
    });
  });

  it('carrière, spécialisation et rangs : gratuits par les choix, le reste acheté', () => {
    expect(r.etat.possessions.find((p) => p.entree === 'chasseur-de-primes')?.choix).toEqual({
      'rangs-de-depart': ['athletisme', 'perception', 'distance-lourde', 'vigilance'],
    });
    expect(r.etat.possessions.find((p) => p.entree === 'assassin')?.choix).toEqual({
      'rangs-de-depart': ['discretion', 'magouilles'],
    });
    expect(r.etat.possessions.find((p) => p.entree === 'distance-lourde')?.rang).toBe(1);
    expect(
      ['athletisme', 'perception', 'distance-lourde', 'vigilance', 'discretion', 'magouilles'].map(
        (c) => rang(f, c),
      ),
    ).toEqual([1, 1, 2, 1, 1, 1]);
    // Rang gratuit d'espèce que l'ancienne app n'appliquait pas
    expect(rang(f, 'sens-de-la-rue')).toBe(1);
    avertit(r, /Sens de la rue : rang 1 accordé par le nouveau système/);
  });

  it('talents : nœuds de l’arbre Assassin, spécialisation retrouvée par les nœuds', () => {
    expect(r.etat.noeuds).toEqual({ 'arbre-assassin': ['l1c1', 'l2c1', 'l1c3'] });
    expect(['cran', 'visee-precise', 'traqueur'].map((t) => rang(f, t))).toEqual([1, 1, 1]);
  });

  it('seuils, encaissement et défense recalculés ; Cran relève le seuil de stress', () => {
    expect(f.valeur('seuilBlessure')).toBe(13); // 10 + Vigueur 3 (dont Stim +1)
    expect(f.valeur('seuilStress')).toBe(13);
    avertit(r, /Seuil de stress : 12 dans l'ancienne fiche, 13 recalculé/);
    expect(f.valeur('encaissement')).toBe(4); // Vigueur 3 + armure légère 1
    expect(f.valeur('defenseMelee')).toBe(1);
    expect(f.valeur('defenseDistance')).toBe(1);
  });

  it('blessures et stress : l’ancienne jauge PV comptait déjà les blessures', () => {
    expect(f.valeur('blessures')).toBe(3);
    expect(f.valeur('stress')).toBe(2);
    expect(f.valeur('neutralise')).toBe(false);
  });

  it('expérience : même reste, dépense passée en une ligne « migration »', () => {
    expect(r.etat.valeurs.xpGagne).toBe(40); // 60 + 80 − 100 (XP de départ bothan)
    expect(r.etat.journal).toEqual([
      { achat: 'migration', objet: 'legacy', cout: 80, monnaie: 'xp', creation: false },
    ]);
    expect(detailSolde(f, 'xp').solde).toBe(60);
  });

  it('Obligation typée d’après son texte, valeur et détail conservés', () => {
    expect(r.etat.possessions.find((p) => p.entree === 'prime')?.champs).toEqual({
      valeur: 10,
      detail: 'Prime sur ma tête posée par Jabba',
    });
    expect(f.valeur('obligation')).toBe(10);
  });

  it('équipement du catalogue, crédits, objets inconnus signalés', () => {
    for (const id of ['fusil-blaster', 'armure-legere', 'stimpack', 'fusil-tenseur'])
      expect(f.possessions.has(id), id).toBe(true);
    expect(f.valeur('credits')).toBe(250);
    // Objet hors catalogue : objet personnalisé qui porte son nom
    expect(r.etat.possessions.find((p) => p.entree === 'objet-libre')?.champs.nom).toBe(
      'Sabre laser de famille',
    );
    expect(r.avertissements.filter((a) => /absent du catalogue/.test(a))).toEqual([]);
    // Quantité legacy migrée sur l'exemplaire, sans avertissement
    expect(r.etat.possessions.find((p) => p.entree === 'stimpack')?.quantite).toBe(3);
    expect(r.avertissements.filter((a) => /Stimpack/.test(a))).toEqual([]);
    // Bonus saisi à la main : devenu un bonus libre, sans système dédié
    expect(r.etat.bonus).toEqual([
      {
        id: 'stim',
        nom: 'Stim',
        source: 'Inventaire',
        actif: true,
        effets: [
          {
            sur: 'attribut',
            attribut: 'vigueur',
            operation: 'ajouter',
            valeur: '1',
            description: 'Stim',
          },
        ],
      },
    ]);
    avertit(r, /Champ personnalisé « Réputation » \(3\) non migré/);
  });
});

describe('Star Wars : objets identiques, quantités et Obligations du même type', () => {
  const second = objet('Fusil blaster', { category: 'armes_distance_standard' });
  const { r, f } = migrer(
    {
      ...bothan,
      data: {
        ...bothan.data,
        Obligations: [
          { value: 10, text: 'Prime sur ma tête posée par Jabba' },
          { value: 5, text: 'Mise à prix impériale' },
        ],
      },
    },
    {
      systemeId: 'star-wars-eote',
      systemes,
      inventaire: [
        objet('Fusil blaster', { category: 'armes_distance_standard' }),
        second,
        objet('Stimpack', { category: 'equipement_general', quantity: 3 }),
        objet('Stimpack', { category: 'equipement_general', quantity: 2 }),
        objet('Armure légère', { category: 'armures', quantity: 2 }),
      ],
      bonus: [
        bonus(second.id, { presence: 1, active: true, category: 'Inventaire', name: 'Viseur' }),
      ],
    },
  );
  const exemplaires = (id: string) =>
    r.etat.possessions
      .filter((p) => p.entree === id)
      .map((p) => [p.exemplaire, p.quantite, p.effets.length]);

  it('deux objets identiques : deux exemplaires, le bonus sur le bon', () => {
    expect(exemplaires('fusil-blaster')).toEqual([
      [undefined, undefined, 0],
      ['2', undefined, 1],
    ]);
    expect(f.sources.map((s) => s.id)).toContain('fusil-blaster#2');
    expect(r.etat.bonus).toEqual([]);
  });

  it('quantités gardées par objet ; un objet ×2 sans quantités donne deux exemplaires', () => {
    expect(exemplaires('stimpack')).toEqual([
      [undefined, 3, 0],
      ['2', 2, 0],
    ]);
    expect(f.possessions.get('stimpack')?.quantite).toBe(5);
    expect(exemplaires('armure-legere')).toEqual([
      [undefined, undefined, 0],
      ['2', undefined, 0],
    ]);
  });

  it('deux Obligations du même type : deux exemplaires, valeurs additionnées', () => {
    expect(
      r.etat.possessions.filter((p) => p.entree === 'prime').map((p) => [p.exemplaire, p.champs]),
    ).toEqual([
      [undefined, { valeur: 10, detail: 'Prime sur ma tête posée par Jabba' }],
      ['2', { valeur: 5, detail: 'Mise à prix impériale' }],
    ]);
    expect(f.valeur('obligation')).toBe(15);
  });

  it('plus d’avertissement d’exemplaire non migré ni d’Obligations cumulées', () => {
    expect(r.avertissements.filter((a) => /exemplaire|un seul migré|cumulées/.test(a))).toEqual([]);
  });
});

/**
 * Droïde technicien (Pirate informatique), PNJ d'une salle où le MJ avait
 * décoché « récupère vers 0 » : PV y comptait les points RESTANTS. Création
 * legacy : 110 XP, Intellect 1→3 (50), puis Informatique 2→3 (15).
 */
const droide = perso('salleSW', 'droide1', {
  Nomperso: 'R7-K4',
  type: 'pnj',
  Race: 'droide',
  Profile: 'technician',
  career: 'technician',
  careerSkillChoices: ['computers', 'mechanics', 'astrogation', 'knowledge_outer_rim'],
  specializations: ['q8ZtR1'],
  specializationSkillChoices: { q8ZtR1: ['computers', 'knowledge_underworld'] },
  skillRanks: {
    computers: 3,
    mechanics: 1,
    astrogation: 1,
    knowledge_outer_rim: 1,
    knowledge_underworld: 1,
    knowledge_warfare: 1,
  },
  unlockedTalents: {},
  vigueur: '1',
  agilite: '1',
  intellect: '3',
  ruse: '1',
  volonte: '1',
  presence: '1',
  PV_Max: 11,
  PV: 8,
  Stress_Max: 11,
  Stress: 0,
  BlessuresCritiques: 2,
  xp: 45,
  xpSpent: 65,
  imageURL: '/images/races/droide.webp',
});

describe('Star Wars : droïde pirate informatique, jauge PV « restante »', () => {
  const { r, f } = migrer(droide, {
    systemes,
    specialisations: {
      q8ZtR1: { kind: 'specialization', name: 'Slicer', careerIds: ['technician'] },
    },
    statsSalle: [
      { key: 'PV', recoversToZero: false },
      { key: 'Stress', recoversToZero: true },
    ],
  });

  it('système déduit des champs, spécialisation lue dans le contenu de la salle', () => {
    expect(r.etat.systeme.id).toBe('star-wars-eote');
    expect(f.possessions.has('pirate-informatique')).toBe(true);
    expect(r.avertissements.some((a) => a.startsWith('Système deviné'))).toBe(false);
  });

  it('blessures = seuil legacy − PV restants', () => {
    expect(f.valeur('blessures')).toBe(3);
    expect(f.valeur('stress')).toBe(0);
  });

  it('caractéristiques et rangs', () => {
    expect(f.valeur('intellect')).toBe(3);
    expect(r.etat.valeurs.intellect).toBe(2);
    expect(rang(f, 'informatique')).toBe(3);
    expect(r.etat.possessions.find((p) => p.entree === 'informatique')?.rang).toBe(1);
    expect(f.valeur('inorganique')).toBe(true);
    expect(rang(f, 'endurant')).toBe(1);
    avertit(r, /Compétence inconnue « knowledge_warfare »/);
  });

  it('seuils inchangés ; Endurant (gratuit pour un droïde) relève l’encaissement', () => {
    expect(f.valeur('seuilBlessure')).toBe(11);
    expect(f.valeur('seuilStress')).toBe(11);
    expect(r.avertissements.some((a) => a.startsWith('Seuil'))).toBe(false);
    expect(f.valeur('encaissement')).toBe(2); // Vigueur 1 + Endurant 1
  });

  it('XP de départ du droïde (175) plus élevée : le reste legacy est gardé', () => {
    expect(r.etat.valeurs.xpGagne).toBe(0);
    expect(r.etat.journal).toEqual([
      { achat: 'migration', objet: 'legacy', cout: 130, monnaie: 'xp', creation: false },
    ]);
    expect(detailSolde(f, 'xp').solde).toBe(45);
    avertit(r, /XP : 175 XP de départ/);
  });

  it('données non migrables signalées', () => {
    avertit(r, /2 blessure\(s\) critique\(s\) non migrée/);
    avertit(r, /PNJ : catégorie/);
    avertit(r, /Avatar « \/images\/races\/droide.webp »/);
    expect(f.valeur('credits')).toBe(0);
  });
});

// ─── D&D classique ───────────────────────────────────────────────────────────

/**
 * Nain guerrier niveau 3 : caractéristiques tirées puis modifiées par la race
 * (DEX 11 − 2, CON 14 + 2) ; PV max 1 + mod CON 3 + 7 au d10, puis +6 et +4
 * aux montées de niveau = 21. Voies : Résistance 2, Bouclier 1, voie du nain 1.
 */
const nain = perso('salleDD', 'nain1', {
  Nomperso: 'Brom',
  type: 'joueurs',
  Race: 'nain',
  Profile: 'guerrier',
  deVie: 'd10',
  niveau: 3,
  FOR: 14,
  DEX: 9,
  CON: 16,
  SAG: 12,
  INT: 10,
  CHA: 8,
  Defense: 9,
  Contact: 3,
  PV_Max: 21,
  PV: 15,
  Voie1: 'Guerrier1.json',
  v1: 2,
  Voie2: 'Guerrier2.json',
  v2: 1,
  Voie3: 'Guerrier3.json',
  v3: 0,
  Voie4: 'Guerrier4.json',
  v4: 0,
  Voie5: 'Guerrier5.json',
  v5: 0,
  Voie6: 'Nain.json',
  v6: 1,
  Taille: 140,
  Poids: 80,
  Background: 'Forgeron exilé de Khaz Morn.',
});
const cuir = objet('Armure de cuir', { category: 'armures' });
const inventaireNain = [
  objet('Épée à une main', {
    category: 'armes-contact',
    diceSelection: '1d8',
    damageStatKeys: ['FOR'],
  }),
  cuir,
  objet("pièce d'OR", { category: 'bourse', quantity: 3 }),
  objet("pièce d'argent", { category: 'bourse', quantity: 5 }),
  objet('Petite potion de vie', { category: 'potions', quantity: 2 }),
  objet('Dague', { category: 'armes-contact', quantity: 3 }),
];

describe('D&D : nain guerrier niveau 3', () => {
  const { r, f } = migrer(nain, {
    systemeId: 'dnd-classic',
    systemes,
    inventaire: inventaireNain,
    bonus: [
      bonus(cuir.id, { Defense: 2, active: true, category: 'Inventaire', name: 'Armure de cuir' }),
      bonus('Guerrier1.json-1', {
        PV_Max: 3,
        active: true,
        category: 'Competence',
        name: 'Robustesse',
      }),
    ],
  });

  it('caractéristiques : bonus racial dans les règles, valeurs affichées inchangées', () => {
    expect(['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((k) => f.valeur(k))).toEqual([
      14, 9, 16, 12, 10, 8,
    ]);
    expect(r.etat.valeurs).toMatchObject({ DEX: 11, CON: 14, niveau: 3 });
  });

  it('race, profil et voies avec leurs capacités', () => {
    expect(f.possessions.has('nain') && f.possessions.has('guerrier')).toBe(true);
    expect(
      ['guerrier-resistance', 'guerrier-bouclier', 'guerrier-combat', 'race-nain'].map((v) =>
        rang(f, v),
      ),
    ).toEqual([2, 1, 0, 1]);
    expect(rang(f, 'guerrier-resistance-armure-naturelle')).toBe(1);
    expect(rang(f, 'race-nain-resistance')).toBe(1);
  });

  it('rangs de voie rejoués au journal des points de capacité', () => {
    expect(r.etat.journal.map((l) => [l.objet, l.cout])).toEqual([
      ['guerrier-resistance', 1],
      ['guerrier-resistance', 1],
      ['guerrier-bouclier', 1],
      ['race-nain', 1],
    ]);
    expect(detailSolde(f, 'pointsCapacite')).toMatchObject({ total: 6, depense: 4, solde: 2 });
  });

  it('PV : PV max legacy conservé par les jets de dés de vie, bonus saisi en plus', () => {
    expect(f.valeur('PV_Max')).toBe(24); // 21 + bonus Robustesse saisi à la main
    expect(f.valeur('PV')).toBe(15);
    expect(
      r.etat.bonus.map((b) => [
        b.nom,
        b.effets.map((e) => e.sur === 'attribut' && [e.attribut, e.valeur]),
      ]),
    ).toEqual([['Robustesse', [['PV_Max', '3']]]]);
  });

  it('défense et attaques recalculées ; le bonus manuel de l’armure est remplacé par ses effets', () => {
    expect(f.valeur('Defense')).toBe(13); // 10 − 1 (DEX) + cuir 2 + armure naturelle 2
    expect(f.valeur('Contact')).toBe(5); // mod FOR 2 + niveau 3
    avertit(
      r,
      /Bonus « Armure de cuir » non migré : l'objet porte déjà ses effets dans le catalogue/,
    );
  });

  it('équipement, pièces et potions en objets de l’inventaire', () => {
    expect(f.possessions.has('epee-longue') && f.possessions.has('cuir')).toBe(true);
    expect(r.etat.valeurs).not.toHaveProperty('bourse');
    const quantite = (id: string) =>
      r.etat.possessions.filter((p) => p.entree === id).map((p) => p.quantite);
    // Dagues en quantité : une seule possession ×3 ; pièces et potions du catalogue
    expect(quantite('dague')).toEqual([3]);
    expect(quantite('piece-d-or')).toEqual([3]);
    expect(quantite('piece-d-argent')).toEqual([5]);
    expect(quantite('petite-potion-de-vie')).toEqual([2]);
    expect(r.avertissements.filter((a) => /^Objet/.test(a))).toEqual([]);
    // Chaque objet legacy est tracé par le chemin de son document
    expect(r.objets.map((o) => o.nom)).toEqual(inventaireNain.map((o) => o.data.message));
    expect(r.objets[0]!.legacyId).toBe(inventaireNain[0]!.path);
    expect(r.details).toEqual({
      Background: 'Forgeron exilé de Khaz Morn.',
      Taille: 140,
      Poids: 80,
    });
  });
});

/**
 * Wolfer nécromancien niveau 2 (race sans entrée dans le nouveau système),
 * nombres enregistrés en chaîne, voie personnalisée, bonus actif et inactif.
 */
const wolfer = perso('salleDD', 'wolfer1', {
  Nomperso: 'Garr',
  type: 'joueurs',
  Race: 'wolfer',
  Profile: 'Nécromancien',
  niveau: '2',
  FOR: '11',
  DEX: '13',
  CON: '10',
  SAG: '12',
  INT: '15',
  CHA: '9',
  PV_Max: '9',
  PV: '6',
  Voie1: 'Necromancien1.json',
  v1: '2',
  Voie2: 'custom:Voie du chaos',
  v2: 1,
  Voie3: 'Wolfer.json',
  v3: 1,
  imageURL: '',
});
const perso1: DocFirestore<CompetencePersonnaliseeLegacy> = {
  path: 'cartes/salleDD/characters/wolfer1/customCompetences/1-0',
  id: '1-0',
  data: {
    voieIndex: 1,
    slotIndex: 0,
    competenceName: 'Frappe du chaos',
    sourceVoie: 'manual',
    sourceRank: 1,
  },
};

describe('D&D : wolfer nécromancien, données partielles', () => {
  const { r, f } = migrer(wolfer, {
    systemes,
    inventaire: [objet('Bâton'), objet('Grimoire relié de peau')],
    competencesPersonnalisees: [perso1],
    bonus: [
      bonus('Wolfer.json-1', {
        FOR: 1,
        active: true,
        category: 'Competence',
        name: 'Force du loup',
      }),
      bonus('b-bottes', { DEX: 2, active: false, category: 'Inventaire', name: 'Bottes' }),
    ],
  });

  it('système déduit des voies, nombres en chaîne lus', () => {
    expect(r.etat.systeme.id).toBe('dnd-classic');
    expect(r.etat.valeurs).toMatchObject({ niveau: 2, FOR: 11, INT: 15 });
    expect(f.valeur('PV_Max')).toBe(9);
    expect(f.valeur('PV')).toBe(6);
    expect(r.avatarUrl).toBeNull();
  });

  it('race inconnue signalée, voie raciale migrée quand même', () => {
    avertit(r, /Race « wolfer » absente du système/);
    expect(rang(f, 'race-wolfer')).toBe(1);
    expect(rang(f, 'necromancien-mort')).toBe(2);
    expect(detailSolde(f, 'pointsCapacite')).toMatchObject({ total: 4, depense: 3 });
  });

  it('voie et capacité personnalisées, bonus inactif gardé inactif', () => {
    avertit(r, /Voie personnalisée « Voie du chaos » \(rang 1\) non migrée/);
    avertit(r, /Capacité personnalisée « Frappe du chaos »/);
    expect(r.etat.bonus.find((b) => b.nom === 'Bottes')).toMatchObject({ actif: false });
    // Objet hors catalogue : objet personnalisé, catégorie legacy reprise
    const grimoire = r.etat.possessions.find((p) => p.entree === 'objet-libre');
    expect(grimoire?.champs).toMatchObject({ nom: 'Grimoire relié de peau', categorie: 'autre' });
    expect(f.possessions.has('baton')).toBe(true);
  });

  it('bonus actif devenu bonus libre', () => {
    expect(f.valeur('FOR')).toBe(12);
    expect(
      r.etat.bonus
        .filter((b) => b.actif)
        .map((b) => b.effets.map((e) => e.sur === 'attribut' && e.attribut)),
    ).toEqual([['FOR']]);
  });
});

// ─── Noobliés ────────────────────────────────────────────────────────────────

/** Minotaure barbare : FOR 14 + 4, INT 10 − 4, CHA 11 − 2 ; PV max 1 + 1 + 9 (d12). */
const minotaure = perso('salleNB', 'mino1', {
  Nomperso: 'Taurok',
  type: 'joueurs',
  Race: 'minotaure',
  Profile: 'barbare',
  deVie: 'd12',
  FOR: 18,
  DEX: 13,
  CON: 12,
  SAG: 10,
  INT: 6,
  CHA: 9,
  PV_Max: 11,
  PV: 7,
  Voie1: 'Barbare1.json',
  v1: 1,
});

describe('Noobliés : minotaure barbare', () => {
  const { r, f } = migrer(minotaure, {
    systemeId: 'nooblies',
    systemes,
    inventaire: [objet('Hache')],
    bonus: [bonus('b1', { FOR: 2, active: true, category: 'Inventaire', name: 'Ceinture' })],
  });

  it('caractéristiques, défense et attaques', () => {
    // FOR 14 + 4 (minotaure) + 2 (bonus « Ceinture » saisi à la main)
    expect(['FOR', 'DEX', 'CON', 'SAG', 'INT', 'CHA'].map((k) => f.valeur(k))).toEqual([
      20, 13, 12, 10, 6, 9,
    ]);
    expect(r.etat.valeurs).toMatchObject({ FOR: 14, INT: 10, CHA: 11 });
    expect(f.valeur('Defense')).toBe(19); // 18 + mod DEX 1
    expect(f.valeur('Contact')).toBe(6); // 1 + mod FOR 5
  });

  it('PV : jet de dé de vie retrouvé', () => {
    expect(r.etat.valeurs.jetDeVie).toBe(9);
    expect(f.valeur('PV_Max')).toBe(11);
    expect(f.valeur('PV')).toBe(7);
  });

  it('capacités raciales ; voies et équipement signalés, bonus gardé en bonus libre', () => {
    expect(rang(f, 'coup-de-corne')).toBe(1);
    avertit(r, /Voie « Barbare1 » \(rang 1\) non migrée : pas de voies/);
    // Pas de catalogue d'équipement : un objet personnalisé
    expect(r.etat.possessions.find((p) => p.entree === 'objet-libre')?.champs.nom).toBe('Hache');
    expect(r.etat.bonus.map((b) => b.nom)).toEqual(['Ceinture']);
  });
});

// ─── Détection ───────────────────────────────────────────────────────────────

describe('détection du système', () => {
  it('par la salle, puis par les champs', () => {
    expect(detecterSysteme({}, { gameSystemId: 'dnd-classic' })).toEqual({
      id: 'dnd-classic',
      certain: true,
    });
    expect(detecterSysteme({}, { nomSysteme: 'Noobliés Chroniques' })).toEqual({
      id: 'nooblies',
      certain: true,
    });
    expect(detecterSysteme({}, { nomSysteme: 'Star Wars : Aux confins de l’Empire' }).id).toBe(
      'star-wars-eote',
    );
    expect(detecterSysteme(bothan.data)).toEqual({ id: 'star-wars-eote', certain: true });
    expect(detecterSysteme(nain.data)).toEqual({ id: 'dnd-classic', certain: true });
    expect(detecterSysteme({ FOR: 12 })).toEqual({ id: 'dnd-classic', certain: false });
  });

  it('un personnage vide donne un état valide et des avertissements', () => {
    const { r } = migrer(perso('s', 'vide', {}), { systemes });
    avertit(r, /Système deviné/);
    avertit(r, /Aucune race/);
    expect(r.nom).toBe('Sans nom');
  });
});
