import { DEFAULT_COMBAT_SETTINGS } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import {
  blockedByTurn,
  canSubmit,
  CLOSED,
  declareBody,
  declaredStage,
  defaultAttacker,
  effectiveRollMode,
  reduceAttackFlow,
  submitKey,
  turnStanding,
  type AttackFlowEvent,
  type AttackFlowState,
  type ComposeState,
} from './attack-flow';
import { attack, combatState } from './test-kit';

const run = (events: AttackFlowEvent[], from: AttackFlowState = CLOSED) =>
  events.reduce(reduceAttackFlow, from);

const open = (extra: Partial<Parameters<typeof openEvent>[0]> = {}) => run([openEvent(extra)]);
function openEvent(
  request: Partial<Extract<AttackFlowEvent, { type: 'open' }>['request']> = {},
): AttackFlowEvent {
  return { type: 'open', request: { campaignId: 'campagne', origin: 'map', ...request } };
}

const ready = () =>
  run([
    openEvent({ attackerId: 'hero', targetIds: ['gobelin'] }),
    { type: 'setAction', actionId: 'frappe', params: { arme: 'epee', bonus: 0 } },
  ]) as ComposeState;

describe('menu d’attaque : ouverture et composition', () => {
  it('ouvre en composition avec les cibles demandées, sans doublon', () => {
    const s = open({ targetIds: ['gobelin', 'gobelin', 'loup'] });
    expect(s.phase).toBe('compose');
    if (s.phase !== 'compose') return;
    expect(s.draft.targetIds).toEqual(['gobelin', 'loup']);
    expect(s.draft.attackerId).toBeNull();
    // Attaquant non précisé : l'interface posera celui par défaut
    expect(s.autoAttacker).toBe(true);
  });

  it('attaquant explicitement vide : le choix revient à l’utilisateur', () => {
    const s = open({ attackerId: null });
    expect(s.phase === 'compose' && s.autoAttacker).toBe(false);
  });

  it('PNJ à la suite : le premier attaque, les autres attendent', () => {
    const s = open({ attackers: ['g1', 'g2', 'g3'] });
    expect(s.phase === 'compose' && s.draft.attackerId).toBe('g1');
    expect(s.phase === 'compose' && s.queue).toEqual(['g2', 'g3']);
  });

  it('cibles : ajout, retrait, bascule (outil de visée), plafond de 50', () => {
    let s = open();
    s = run(
      [
        { type: 'toggleTarget', characterId: 'a' },
        { type: 'toggleTarget', characterId: 'b' },
        { type: 'toggleTarget', characterId: 'a' },
        { type: 'addTargets', characterIds: ['c', 'b'] },
      ],
      s,
    );
    expect(s.phase === 'compose' && s.draft.targetIds).toEqual(['b', 'c']);
    s = reduceAttackFlow(s, {
      type: 'setTargets',
      characterIds: Array.from({ length: 60 }, (_, i) => `t${i}`),
    });
    expect(s.phase === 'compose' && s.draft.targetIds.length).toBe(50);
  });

  it('visée : marche et arrêt, sans toucher au brouillon', () => {
    const s = run([{ type: 'aim', on: true }], open());
    expect(s.phase === 'compose' && s.aiming).toBe(true);
    const off = reduceAttackFlow(s, { type: 'aim', on: false });
    expect(off.phase === 'compose' && off.aiming).toBe(false);
  });

  it('paramètres et ajustements libres', () => {
    const s = run(
      [
        { type: 'setParam', id: 'bonus', value: 2 },
        { type: 'setAdjustment', die: null, value: 3 },
        { type: 'setAdjustment', die: 'fortune', value: 2 },
        { type: 'setAdjustment', die: 'infortune', value: -1 },
        { type: 'setAdjustment', die: 'fortune', value: 0 },
      ],
      ready(),
    ) as ComposeState;
    expect(s.draft.params).toEqual({ arme: 'epee', bonus: 2 });
    expect(s.draft.adjustments).toEqual({ bonus: 3, dice: { infortune: -1 } });
  });
});

describe('menu d’attaque : déclaration', () => {
  it('« Attaquer » exige un attaquant, une action et une cible', () => {
    expect(canSubmit(open())).toMatchObject({ ok: false, reason: 'no_attacker' });
    expect(canSubmit(open({ attackerId: 'hero' }))).toMatchObject({ reason: 'no_action' });
    const noTarget = run([{ type: 'setTargets', characterIds: [] }], ready());
    expect(canSubmit(noTarget)).toMatchObject({ reason: 'no_target' });
    expect(canSubmit(ready())).toEqual({ ok: true });
    // Plafond de l'action (`multicible.max`)
    const two = run([{ type: 'addTargets', characterIds: ['loup'] }], ready());
    expect(canSubmit(two, { maxTargets: 1 })).toMatchObject({ reason: 'too_many_targets' });
  });

  it('un envoi impossible ne quitte pas la composition', () => {
    const s = reduceAttackFlow(open(), { type: 'submit', key: 'k1' });
    expect(s.phase).toBe('compose');
  });

  it('envoi, puis attaque déclarée, puis mises à jour en direct (versions croissantes)', () => {
    let s = reduceAttackFlow(ready(), { type: 'submit', key: 'k1' });
    expect(s.phase).toBe('submitting');
    // Rien ne modifie le brouillon pendant l'envoi
    s = reduceAttackFlow(s, { type: 'toggleTarget', characterId: 'loup' });
    expect(s.phase === 'submitting' && s.draft.targetIds).toEqual(['gobelin']);
    const a = attack({ version: 2 });
    s = reduceAttackFlow(s, { type: 'declared', attack: a });
    expect(s.phase === 'declared' && s.attack).toBe(a);
    const older = attack({ version: 1, status: 'awaiting_reactions' });
    expect(reduceAttackFlow(s, { type: 'attackUpdated', attack: older })).toBe(s);
    const newer = attack({ version: 3, status: 'applied' });
    const updated = reduceAttackFlow(s, { type: 'attackUpdated', attack: newer });
    expect(updated.phase === 'declared' && updated.attack.status).toBe('applied');
    // Une autre attaque ne remplace pas celle suivie
    const other = reduceAttackFlow(updated, {
      type: 'attackUpdated',
      attack: attack({ id: 'autre', version: 9 }),
    });
    expect(other).toBe(updated);
  });

  it('échec passager : même clé d’idempotence à la reprise ; refus : clé neuve', () => {
    const fresh = () => 'neuve';
    const sent = reduceAttackFlow(ready(), { type: 'submit', key: 'k1' });
    const network = reduceAttackFlow(sent, {
      type: 'rejected',
      message: 'Serveur injoignable',
      retryable: true,
    });
    expect(network.phase === 'compose' && network.error).toBe('Serveur injoignable');
    expect(submitKey(network, fresh)).toBe('k1');
    // Le brouillon change : c'est une autre déclaration
    const edited = reduceAttackFlow(network, { type: 'setParam', id: 'bonus', value: 1 });
    expect(submitKey(edited, fresh)).toBe('neuve');
    const refused = reduceAttackFlow(sent, {
      type: 'rejected',
      message: 'Arme non possédée',
      retryable: false,
    });
    expect(submitKey(refused, fresh)).toBe('neuve');
  });

  it('corps de la déclaration : paramètres, mode de jet dès deux cibles, dés du serveur', () => {
    const one = declareBody(ready(), {
      gm: false,
      settings: DEFAULT_COMBAT_SETTINGS,
      params: { arme: 'epee' },
      actionDefaultRollMode: 'shared',
      dice: 'server',
    });
    expect(one).toEqual({
      attackerId: 'hero',
      action: 'frappe',
      params: { arme: 'epee' },
      targets: ['gobelin'],
      dice: 'server',
      origin: 'map',
    });
    const zone = run([{ type: 'addTargets', characterIds: ['loup'] }], ready()) as ComposeState;
    const body = declareBody(zone, {
      gm: true,
      settings: DEFAULT_COMBAT_SETTINGS,
      params: {},
      actionDefaultRollMode: 'shared',
      dice: 'server',
    });
    expect(body.rollMode).toBe('shared');
    expect(body.params).toBeUndefined();
    // MJ : cachée par défaut (gmRollsHidden), bascule par attaque
    expect(body.visibility).toBe('gm');
    const shown = reduceAttackFlow(zone, { type: 'setVisibility', visibility: 'public' });
    expect(
      declareBody(shown as ComposeState, {
        gm: true,
        settings: DEFAULT_COMBAT_SETTINGS,
        params: {},
        actionDefaultRollMode: 'per_target',
        dice: 'server',
      }).visibility,
    ).toBe('public');
  });

  it('ajustements libres envoyés seulement s’ils existent', () => {
    const s = run(
      [
        { type: 'setAdjustment', die: 'fortune', value: 1 },
        { type: 'setAdjustment', die: null, value: -2 },
      ],
      ready(),
    ) as ComposeState;
    const body = declareBody(s, {
      gm: false,
      settings: DEFAULT_COMBAT_SETTINGS,
      params: {},
      actionDefaultRollMode: 'per_target',
      dice: 'server',
    });
    expect(body.adjustments).toEqual({ dice: [{ die: 'fortune', count: 1 }], bonus: -2 });
  });

  it('mode de jet : celui de l’action, sauf choix ; sans objet pour une cible', () => {
    const s = ready();
    expect(effectiveRollMode(s.draft, 'shared')).toBe('per_target');
    const two = run([{ type: 'addTargets', characterIds: ['loup'] }], s) as ComposeState;
    expect(effectiveRollMode(two.draft, 'shared')).toBe('shared');
    const chosen = reduceAttackFlow(two, {
      type: 'setRollMode',
      rollMode: 'per_target',
    }) as ComposeState;
    expect(effectiveRollMode(chosen.draft, 'shared')).toBe('per_target');
  });
});

describe('menu d’attaque : après la déclaration', () => {
  const declared = () =>
    run(
      [
        { type: 'submit', key: 'k1' },
        { type: 'declared', attack: attack() },
      ],
      run([{ type: 'setAdjustment', die: null, value: 2 }], ready()),
    );

  it('« Nouvelle attaque » vide les cibles, « Mêmes cibles » les garde', () => {
    const fresh = reduceAttackFlow(declared(), { type: 'again', keepTargets: false });
    expect(fresh.phase === 'compose' && fresh.draft.targetIds).toEqual([]);
    expect(fresh.phase === 'compose' && fresh.draft.actionId).toBe('frappe');
    expect(fresh.phase === 'compose' && fresh.draft.adjustments.bonus).toBe(0);
    const same = reduceAttackFlow(declared(), { type: 'again', keepTargets: true });
    expect(same.phase === 'compose' && same.draft.targetIds).toEqual(['gobelin']);
  });

  it('PNJ suivant : même action, mêmes paramètres, mêmes cibles', () => {
    let s = run([
      openEvent({ attackers: ['g1', 'g2'], targetIds: ['hero'] }),
      { type: 'setAction', actionId: 'frappe', params: { arme: 'epee' } },
      { type: 'submit', key: 'k' },
      { type: 'declared', attack: attack({ attackerId: 'g1' }) },
    ]);
    s = reduceAttackFlow(s, { type: 'nextAttacker' });
    expect(s.phase).toBe('compose');
    if (s.phase !== 'compose') return;
    expect(s.draft).toMatchObject({
      attackerId: 'g2',
      actionId: 'frappe',
      params: { arme: 'epee' },
      targetIds: ['hero'],
    });
    expect(s.queue).toEqual([]);
    // File vide : rien ne change
    expect(reduceAttackFlow(s, { type: 'nextAttacker' })).toBe(s);
  });

  it('« Mes attaques » : suivre une attaque déjà déclarée, puis la rejouer', () => {
    const shown = reduceAttackFlow(open(), {
      type: 'show',
      attack: attack({ attackerId: 'hero', params: { arme: 'arc' } }),
    });
    expect(shown.phase).toBe('declared');
    const again = reduceAttackFlow(shown, { type: 'again', keepTargets: true });
    expect(again.phase === 'compose' && again.draft).toMatchObject({
      attackerId: 'hero',
      actionId: 'frappe',
      params: { arme: 'arc' },
      targetIds: ['gobelin'],
    });
  });

  it('étape affichée selon le statut', () => {
    expect(declaredStage(attack({ status: 'awaiting_reactions' }))).toBe('reactions');
    expect(declaredStage(attack({ status: 'awaiting_dice' }))).toBe('dice');
    expect(declaredStage(attack({ status: 'pending' }))).toBe('result');
    expect(declaredStage(attack({ status: 'applied' }))).toBe('result');
    expect(declaredStage(attack({ status: 'cancelled' }))).toBe('cancelled');
    expect(declaredStage(attack({ status: 'failed' }))).toBe('failed');
  });

  it('fermer depuis n’importe quel état', () => {
    expect(reduceAttackFlow(declared(), { type: 'close' })).toBe(CLOSED);
  });
});

describe('attaquant par défaut et tour', () => {
  const sideOf = (id: string) => (id === 'hero' ? 'players' : 'enemies') as never;

  it('joueur : le personnage incarné ; MJ : le PNJ qui agit, sinon aucun', () => {
    const base = { candidates: ['hero', 'gobelin'], heroId: 'hero', sideOf };
    expect(defaultAttacker({ ...base, gm: false, currentActorId: 'gobelin' })).toBe('hero');
    expect(defaultAttacker({ ...base, gm: true, currentActorId: 'gobelin' })).toBe('gobelin');
    expect(defaultAttacker({ ...base, gm: true, currentActorId: 'hero' })).toBeNull();
    expect(defaultAttacker({ ...base, gm: true, currentActorId: null, requested: 'hero' })).toBe(
      'hero',
    );
    // Demande non permise (joueur, personnage d'un autre) : ignorée
    expect(
      defaultAttacker({
        candidates: ['hero'],
        heroId: 'hero',
        sideOf,
        gm: false,
        currentActorId: null,
        requested: 'gobelin',
      }),
    ).toBe('hero');
  });

  it('hors tour : marqué, bloqué pour un joueur si le réglage l’interdit', () => {
    const combat = combatState();
    expect(turnStanding(null, 'hero', null)).toBe('free');
    expect(turnStanding(combat, 'hero', 'hero')).toBe('on_turn');
    expect(turnStanding(combat, 'gobelin', 'hero')).toBe('out_of_turn');
    expect(turnStanding({ ...combat, initiativeRolled: false }, 'gobelin', 'hero')).toBe('free');
    const strict = { ...DEFAULT_COMBAT_SETTINGS, playersActOutsideTurn: false };
    expect(blockedByTurn('out_of_turn', false, strict)).toBe(true);
    expect(blockedByTurn('out_of_turn', true, strict)).toBe(false);
    expect(blockedByTurn('out_of_turn', false, DEFAULT_COMBAT_SETTINGS)).toBe(false);
  });

  it('créneaux : un créneau de son camp sans acteur, c’est son tour', () => {
    const combat = combatState({
      mode: 'slots',
      slots: [{ side: 'players' }, { side: 'enemies' }],
      currentIndex: 0,
      currentActorId: null,
    });
    expect(turnStanding(combat, 'hero', null)).toBe('on_turn');
    expect(turnStanding(combat, 'gobelin', null)).toBe('out_of_turn');
  });
});
