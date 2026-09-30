import { describe, expect, it } from 'vitest';
import {
  AddCombatParticipants,
  ApplyAttack,
  ApplyAttacks,
  Attack,
  ATTACK_TARGETS_MAX,
  AttackReaction,
  CombatAimMessage,
  CombatEventPayloads,
  CombatState,
  CombatTurnChangedPayload,
  CombatTurnResponse,
  DeclareAttack,
  DEFAULT_COMBAT_SETTINGS,
  EndCombat,
  ListAttacksQuery,
  NextTurn,
  OverrideAttackOutcome,
  RevertAttack,
  RollCombatInitiative,
  SetTurn,
  StartCombat,
  SubmitRollDice,
  UpdateCombatParticipant,
  UpdateCombatSettings,
} from './combat.js';
import { EventType } from './events.js';

const A = 'A1B2C3D4-0000-4000-8000-000000000001';
const B = 'a1b2c3d4-0000-4000-8000-000000000002';
const C = 'a1b2c3d4-0000-4000-8000-000000000003';

/** Réponse de l'API combat d'avant ce contrat (docs/api-campaign.md). */
const ancienEtat = {
  id: 'c1',
  round: 2,
  mode: 'slots',
  order: [
    { characterId: B, side: 'players', sortKeys: [2, 1], hasActed: true },
    { characterId: C, side: 'enemies', sortKeys: [1, 0], hasActed: false },
  ],
  currentIndex: 1,
  slots: [{ side: 'players' }, { side: 'enemies' }],
  initiativeRolled: true,
  version: 7,
};

const jetNumerique = {
  kind: 'numeric',
  formula: '1d20 + valeur(score)',
  dice: [{ faces: 20, values: [{ value: 17, kept: true, exploded: false, source: 'physical' }] }],
  value: 21,
  bonuses: [{ source: 'beni', name: 'Béni', value: 1, side: 'actor' }],
  total: 22,
  natural: 17,
};

const jetSymboles = {
  kind: 'symbols',
  pool: [
    { die: 'aptitude', count: 2 },
    { die: 'difficulte', count: 2 },
  ],
  construction: [
    {
      source: 'pas-de-cote',
      name: 'Défense de la cible',
      operation: 'upgrade',
      die: 'difficulte',
      to: 'defi',
      count: 1,
      side: 'target',
    },
  ],
  dice: [{ die: 'aptitude', face: 4, symbols: { succes: 2 }, source: 'physical' }],
  symbols: { succes: 2, echec: 1 },
  results: { succesNets: 1 },
};

describe('état du combat', () => {
  it('lit une réponse de l’API existante sans les ajouts', () => {
    const e = CombatState.parse(ancienEtat);
    expect(e.order[0]!.visibleToPlayers).toBeUndefined();
    expect(e.currentActorId).toBeUndefined();
    expect(
      CombatTurnResponse.parse({ ...ancienEtat, durationFailures: [C] }).durationFailures,
    ).toEqual([C]);
  });

  it('accepte les ajouts : vue expurgée, initiative détaillée, réglages', () => {
    const e = CombatState.parse({
      ...ancienEtat,
      mode: 'individual',
      slots: undefined,
      currentIndex: -1,
      redacted: true,
      currentActorId: null,
      turn: 12,
      canGoBack: true,
      settings: {},
      order: [
        {
          ...ancienEtat.order[0],
          visibleToPlayers: true,
          initiative: {
            summary: '17 (d20 : 14 + 3)',
            params: {},
            source: 'physical',
            rolledAt: '2026-09-30T10:00:00Z',
          },
        },
      ],
    });
    expect(e.settings).toEqual(DEFAULT_COMBAT_SETTINGS);
    expect(e.order[0]!.initiative?.source).toBe('physical');
  });

  it('réglages par défaut : parité avec l’ancienne app', () => {
    expect(DEFAULT_COMBAT_SETTINGS).toEqual({
      playersActOutsideTurn: true,
      gmRollsHidden: true,
      physicalDice: true,
    });
    expect(UpdateCombatSettings.safeParse({ version: 3 }).success).toBe(false);
    expect(UpdateCombatSettings.safeParse({ physicalDice: false }).success).toBe(true);
  });
});

describe('entrées du combat', () => {
  it('démarrer : corps existant accepté tel quel, identifiants en minuscules', () => {
    const s = StartCombat.parse({ participants: [A, B], mode: 'slots' });
    expect(s.participants).toEqual([A.toLowerCase(), B]);
    // Route existante : tolérante aux clés inconnues, comme aujourd'hui
    expect(StartCombat.safeParse({ participants: [A], autre: 1 }).success).toBe(true);
    expect(StartCombat.safeParse({ participants: [] }).success).toBe(false);
    expect(
      StartCombat.safeParse({ participants: [A], paramsBySide: { players: { competence: 'x' } } })
        .success,
    ).toBe(true);
    expect(
      StartCombat.safeParse({ participants: [A], paramsBySide: { neutres: {} } }).success,
    ).toBe(false);
  });

  it('initiative : paramètres par personnage (existant), par camp, sous-ensemble', () => {
    expect(RollCombatInitiative.parse({}).params).toBeUndefined();
    expect(
      RollCombatInitiative.safeParse({
        params: { [B]: { competence: 'vigilance' } },
        paramsBySide: { enemies: { competence: 'sang-froid' } },
        participants: [C],
        askPlayers: true,
      }).success,
    ).toBe(true);
  });

  it('participants : pas de doublon, initiative au choix', () => {
    expect(
      AddCombatParticipants.safeParse({
        participants: [
          { characterId: A, initiative: 'ask' },
          { characterId: B, initiative: { sortKeys: [12] } },
        ],
      }).success,
    ).toBe(true);
    expect(
      AddCombatParticipants.safeParse({
        participants: [{ characterId: A }, { characterId: A.toLowerCase() }],
      }).success,
    ).toBe(false);
    expect(UpdateCombatParticipant.safeParse({ version: 2 }).success).toBe(false);
    expect(UpdateCombatParticipant.safeParse({ sortKeys: [3, 1] }).success).toBe(true);
  });

  it('tours : suivant (existant), donner le tour, fin', () => {
    expect(NextTurn.parse({}).characterId).toBeUndefined();
    expect(SetTurn.safeParse({ characterId: A }).success).toBe(true);
    expect(SetTurn.safeParse({ slotIndex: 2 }).success).toBe(true);
    expect(SetTurn.safeParse({ characterId: A, slotIndex: 2 }).success).toBe(false);
    expect(SetTurn.safeParse({}).success).toBe(false);
    expect(EndCombat.parse({})).toEqual({});
  });
});

describe('attaques', () => {
  it('déclarer : cibles uniques et bornées, clés inconnues refusées', () => {
    const d = DeclareAttack.parse({ attackerId: A, action: 'attaque', targets: [B, C] });
    expect(d.attackerId).toBe(A.toLowerCase());
    expect(
      DeclareAttack.safeParse({ attackerId: A, action: 'attaque', targets: [B, B] }).success,
    ).toBe(false);
    expect(DeclareAttack.safeParse({ attackerId: A, action: 'attaque', targets: [] }).success).toBe(
      false,
    );
    expect(
      DeclareAttack.safeParse({ attackerId: A, action: 'attaque', targets: [B], cheat: true })
        .success,
    ).toBe(false);
    const trop = Array.from(
      { length: ATTACK_TARGETS_MAX + 1 },
      (_, i) => `a1b2c3d4-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(
      DeclareAttack.safeParse({ attackerId: A, action: 'attaque', targets: trop }).success,
    ).toBe(false);
  });

  it('ajustements libres : dés non nuls, une fois par sorte, jamais vides', () => {
    const base = { attackerId: A, action: 'attaque', targets: [B] };
    expect(
      DeclareAttack.safeParse({
        ...base,
        adjustments: {
          dice: [
            { die: 'maitrise', count: 1 },
            { die: 'infortune', count: -1 },
          ],
        },
      }).success,
    ).toBe(true);
    expect(DeclareAttack.safeParse({ ...base, adjustments: { bonus: -2 } }).success).toBe(true);
    expect(DeclareAttack.safeParse({ ...base, adjustments: {} }).success).toBe(false);
    expect(
      DeclareAttack.safeParse({ ...base, adjustments: { dice: [{ die: 'maitrise', count: 0 }] } })
        .success,
    ).toBe(false);
    expect(
      DeclareAttack.safeParse({
        ...base,
        adjustments: {
          dice: [
            { die: 'maitrise', count: 1 },
            { die: 'maitrise', count: 1 },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('réaction : des paramètres ou « skip », pas les deux', () => {
    expect(AttackReaction.safeParse({ characterId: B, params: { esquive: 1 } }).success).toBe(true);
    expect(AttackReaction.safeParse({ characterId: B, skip: true }).success).toBe(true);
    expect(AttackReaction.safeParse({ characterId: B, params: {}, skip: true }).success).toBe(
      false,
    );
    expect(AttackReaction.safeParse({ characterId: B }).success).toBe(false);
  });

  it('dés : faces lues, un résultat par dé', () => {
    expect(
      SubmitRollDice.safeParse({ stepId: 'roll:1', results: [{ id: 'b:roll:0', value: 17 }] })
        .success,
    ).toBe(true);
    expect(
      SubmitRollDice.safeParse({
        stepId: 'roll:1',
        results: [
          { id: 'x', value: 3 },
          { id: 'x', value: 4 },
        ],
      }).success,
    ).toBe(false);
    expect(
      SubmitRollDice.safeParse({ stepId: 'roll:1', results: [{ id: 'x', value: 0 }] }).success,
    ).toBe(false);
    expect(
      SubmitRollDice.safeParse({ stepId: 'roll:1', results: [], serverFallback: true }).success,
    ).toBe(true);
  });

  it('appliquer : version obligatoire, valeurs corrigées strictes', () => {
    const ok = ApplyAttack.safeParse({
      version: 4,
      targets: [
        {
          characterId: B,
          apply: true,
          modifications: [
            {
              kind: 'attribute',
              attribute: 'PV',
              operation: 'subtract',
              value: 3,
              damageType: 'feu',
            },
            { kind: 'entry', entry: 'etourdi', operation: 'give', ranks: 1, duration: 2 },
          ],
          tables: [{ table: 'blessures-critiques', apply: true, entry: 'commotion' }],
        },
      ],
      actor: { apply: false },
      note: 'Résistance au feu',
    });
    expect(ok.success).toBe(true);
    expect(ApplyAttack.safeParse({ targets: [{ characterId: B, apply: true }] }).success).toBe(
      false,
    );
    expect(ApplyAttack.safeParse({ version: 1, targets: [] }).success).toBe(false);
    // Le bloc dit qui est touché : pas d'`entity` dans une valeur corrigée
    expect(
      ApplyAttack.safeParse({
        version: 1,
        targets: [
          {
            characterId: B,
            apply: true,
            modifications: [
              { kind: 'attribute', entity: 'actor', attribute: 'PV', operation: 'add', value: 1 },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ApplyAttack.safeParse({
        version: 1,
        targets: [
          {
            characterId: B,
            apply: true,
            modifications: [{ kind: 'entry', entry: 'x', operation: 'give', ranks: -1 }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('tout appliquer : un rapport une seule fois', () => {
    const item = { attackId: A, version: 2, targets: [{ characterId: B, apply: true }] };
    expect(ApplyAttacks.safeParse({ items: [item] }).success).toBe(true);
    expect(ApplyAttacks.safeParse({ items: [item, { ...item }] }).success).toBe(false);
  });

  it('annuler, corriger l’issue, lister', () => {
    expect(RevertAttack.safeParse({ version: 5, force: true }).success).toBe(true);
    expect(
      OverrideAttackOutcome.safeParse({ version: 5, targets: [{ characterId: B, critical: true }] })
        .success,
    ).toBe(true);
    expect(
      OverrideAttackOutcome.safeParse({ version: 5, targets: [{ characterId: B }] }).success,
    ).toBe(false);
    expect(ListAttacksQuery.parse({ limit: '20', status: 'pending' }).limit).toBe(20);
    expect(ListAttacksQuery.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('rapport : vue du MJ (résultat complet) et vue expurgée d’un joueur', () => {
    const base = {
      id: 'att1',
      campaignId: 'camp1',
      combatId: 'c1',
      round: 2,
      turn: 5,
      attackerId: B,
      action: { id: 'attaque', name: 'Attaque' },
      params: { arme: 'epee-longue#2' },
      rollMode: 'per_target',
      dice: 'physical',
      visibility: 'public',
      status: 'pending',
      outOfTurn: false,
      selfTarget: false,
      pendingSteps: [],
      createdBy: 'u1',
      createdAt: '2026-09-30T10:00:00Z',
      resolvedAt: '2026-09-30T10:00:05Z',
      decidedAt: null,
      version: 3,
    };
    const issue = { success: true, critical: false, fumble: false };
    const mj = Attack.parse({
      ...base,
      redacted: false,
      actor: { modifications: [], decision: 'pending' },
      targets: [
        {
          characterId: C,
          status: 'resolved',
          decision: 'pending',
          view: {
            outcome: issue,
            roll: jetNumerique,
            values: [{ key: 'degats', value: 9 }],
            explanations: [],
          },
          result: {
            outcome: issue,
            roll: jetNumerique,
            variables: { degats: 9, subis: 6 },
            modifications: [
              {
                kind: 'attribute',
                entity: 'target',
                attribute: 'PV',
                operation: 'subtract',
                value: 6,
                damageType: 'physique',
                raw: 9,
                resistances: [
                  { source: 'cuir', name: 'RD', operation: 'reduce', value: 3, ignored: false },
                ],
              },
            ],
            tables: [],
            explanations: ['Jet 1d20 + valeur(score) = 21 [d20 : 17]'],
            errors: [],
          },
        },
      ],
    });
    expect(mj.targets[0]!.result?.modifications[0]).toMatchObject({ raw: 9 });

    const joueur = Attack.parse({
      ...base,
      redacted: true,
      targets: [
        {
          characterId: C,
          status: 'resolved',
          decision: 'applied',
          view: { outcome: issue, roll: jetSymboles, values: [], explanations: [] },
        },
      ],
    });
    expect(joueur.targets[0]!.result).toBeUndefined();
    expect(joueur.targets[0]!.view?.roll.kind).toBe('symbols');

    // Dés physiques en attente : l'auteur lance les siens, un jet de sauvegarde revient à la cible
    const enCours = Attack.parse({
      ...base,
      status: 'awaiting_dice',
      redacted: false,
      targets: [{ characterId: C, status: 'awaiting_dice', decision: 'pending' }],
      pendingSteps: [
        {
          id: 'roll:1',
          phase: 'roll',
          dice: [{ id: `${C}:roll:0`, targetId: C, faces: 20 }],
        },
        {
          id: 'save:1',
          phase: 'roll',
          roller: 'target',
          targetId: C,
          dice: [{ id: `${C}:save:0`, targetId: C, faces: 8, die: 'aptitude' }],
        },
      ],
    });
    expect(enCours.pendingSteps.map((s) => s.roller ?? 'author')).toEqual(['author', 'target']);
  });
});

describe('événements et direct', () => {
  it('types au format domaine.action', () => {
    for (const type of Object.keys(CombatEventPayloads))
      expect(EventType.safeParse(type).success, type).toBe(true);
  });

  it('changement de tour : les causes existantes restent valides', () => {
    for (const reason of ['initiative', 'next', 'new_round', 'participants_removed'])
      expect(
        CombatTurnChangedPayload.safeParse({ reason, round: 1, currentIndex: 0, version: 2 })
          .success,
      ).toBe(true);
    expect(
      CombatTurnChangedPayload.safeParse({
        reason: 'previous',
        round: 1,
        currentIndex: 0,
        version: 3,
      }).success,
    ).toBe(true);
  });

  it('visée : 50 cibles au plus', () => {
    expect(CombatAimMessage.safeParse({ a: 'p1', t: ['p2'] }).success).toBe(true);
    expect(CombatAimMessage.safeParse({ a: 'p1', t: [], end: true }).success).toBe(true);
    expect(
      CombatAimMessage.safeParse({ a: 'p1', t: Array.from({ length: 51 }, (_, i) => `t${i}`) })
        .success,
    ).toBe(false);
  });
});
