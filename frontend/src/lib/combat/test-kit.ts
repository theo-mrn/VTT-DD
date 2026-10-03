/**
 * Banc d'essai du combat côté front, sans React : un petit système écrit en données (armes,
 * talent, actions à cible, défense active, action sans cible), des fiches calculées par
 * `@vtt/rules`, et des attaques du contrat. Réservé aux tests (`*.test.ts`).
 */
import type { Attack, AttackTarget, CombatState } from '@vtt/contracts';
import {
  calculer,
  charger,
  EtatEntite,
  type EtatEntiteSaisi,
  type Fiche,
  type SystemeCharge,
  type SystemeSaisi,
} from '@vtt/rules';

export const combatSystem: SystemeSaisi = {
  format: 1,
  id: 'test-combat',
  version: '1.0.0',
  nom: 'Test combat',
  modificateur: 'floor((valeur - 10) / 2)',
  entites: [
    {
      id: 'personnage',
      nom: 'Personnage',
      groupes: [{ id: 'carac', nom: 'Caractéristiques' }],
      attributs: [
        {
          cle: 'FOR',
          nom: 'Force',
          nature: 'base',
          defaut: 10,
          min: 1,
          max: 20,
          modificateur: true,
          groupe: 'carac',
        },
        {
          cle: 'DEX',
          nom: 'Dextérité',
          nature: 'base',
          defaut: 10,
          min: 1,
          max: 20,
          modificateur: true,
          groupe: 'carac',
        },
        { cle: 'Defense', nom: 'Défense', nature: 'derivee', formule: '10 + mod(@DEX)' },
        { cle: 'PV_Max', nom: 'PV max', nature: 'derivee', formule: '10' },
        { cle: 'PV', nom: 'Points de vie', nature: 'ressource', max: '@PV_Max' },
      ],
    },
  ],
  sortes: [
    {
      id: 'arme',
      nom: 'Arme',
      pour: ['personnage'],
      champs: [
        { id: 'degats', nom: 'Dégâts', type: 'formule' },
        { id: 'bonus', nom: 'Bonus', type: 'nombre', defaut: 0 },
      ],
    },
    { id: 'talent', nom: 'Talent', pour: ['personnage'] },
  ],
  catalogue: [
    { id: 'epee', sorte: 'arme', nom: 'Épée', champs: { degats: '4 + mod(@FOR)', bonus: 1 } },
    { id: 'arc', sorte: 'arme', nom: 'Arc', champs: { degats: '3', bonus: 2 } },
    { id: 'botte', sorte: 'talent', nom: 'Botte secrète' },
  ],
  actions: [
    {
      id: 'frappe',
      nom: 'Frappe',
      pour: ['personnage'],
      cible: 'personnage',
      parametres: [
        { id: 'arme', nom: 'Arme', type: 'entree', sorte: 'arme' },
        { id: 'bonus', nom: 'Bonus', type: 'nombre', defaut: 0 },
        { id: 'botte', nom: 'Botte', type: 'booleen', exige: 'possede("botte")' },
        { id: 'esquive', nom: 'Esquive', type: 'nombre', par: 'cible' },
      ],
      jet: {
        type: 'numerique',
        formule: '1d20 + mod(@FOR) + arme.bonus + bonus',
        reussite: 'total >= @cible.Defense',
      },
      apres: [{ cle: 'degats', formule: 'arme.degats' }],
      consequences: [
        {
          condition: 'reussi',
          entite: 'cible',
          attribut: 'PV',
          operation: 'retirer',
          valeur: 'degats',
        },
      ],
    },
    {
      id: 'soin',
      nom: 'Soin',
      pour: ['personnage'],
      cible: 'personnage',
      jet: { type: 'numerique', formule: '1d4 + @cible.PV_Max - @cible.PV' },
      consequences: [{ entite: 'cible', attribut: 'PV', operation: 'ajouter', valeur: 'total' }],
    },
    {
      id: 'charge',
      nom: 'Charge',
      pour: ['personnage'],
      cible: 'personnage',
      exige: 'possede("botte")',
      jet: { type: 'numerique', formule: '2d6' },
    },
    {
      id: 'sprint',
      nom: 'Sprint',
      pour: ['personnage'],
      jet: { type: 'numerique', formule: '1d20 + mod(@DEX)' },
    },
  ],
};

export function loadSystem(s: SystemeSaisi = combatSystem): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

export function sheet(s: SystemeCharge, e: Partial<EtatEntiteSaisi> = {}): Fiche {
  return calculer(
    s,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: s.source.id, version: s.source.version },
      ...e,
    }),
  );
}

export function combatState(extra: Partial<CombatState> = {}): CombatState {
  return {
    id: 'combat-1',
    round: 1,
    mode: 'individual',
    order: [
      { characterId: 'hero', side: 'players', sortKeys: [18], hasActed: false },
      { characterId: 'gobelin', side: 'enemies', sortKeys: [12], hasActed: false },
      { characterId: 'loup', side: 'enemies', sortKeys: [8], hasActed: false },
    ],
    currentIndex: 0,
    initiativeRolled: true,
    version: 3,
    currentActorId: 'hero',
    ...extra,
  };
}

export function attackTarget(extra: Partial<AttackTarget> = {}): AttackTarget {
  return { characterId: 'gobelin', status: 'resolved', decision: 'pending', ...extra };
}

export function attack(extra: Partial<Attack> = {}): Attack {
  return {
    id: 'attaque-1',
    campaignId: 'campagne',
    combatId: 'combat-1',
    round: 1,
    turn: 1,
    attackerId: 'hero',
    action: { id: 'frappe', name: 'Frappe' },
    params: { arme: 'epee' },
    rollMode: 'per_target',
    dice: 'server',
    visibility: 'public',
    status: 'pending',
    outOfTurn: false,
    selfTarget: false,
    targets: [attackTarget()],
    pendingSteps: [],
    createdBy: 'alice',
    createdAt: '2026-09-30T10:00:00.000Z',
    resolvedAt: '2026-09-30T10:00:01.000Z',
    decidedAt: null,
    version: 2,
    redacted: false,
    ...extra,
  };
}
