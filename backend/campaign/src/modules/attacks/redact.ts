/**
 * Ce que chacun voit d'une attaque (docs/combat.md § 7.6) :
 *
 * - le MJ : tout (rapport complet `result`, coûts de l'attaquant `actor`, ce qui a été appliqué,
 *   réactions, note) ;
 * - l'auteur (ou le joueur qui incarne l'attaquant) : la vue de l'attaquant (`view`) de chaque
 *   cible qu'il voit, le statut et la décision ; ce qui a été appliqué seulement à un
 *   personnage du camp des joueurs ; jamais `result`, `actor`, les réactions ni la note ;
 * - le joueur d'une cible qui doit réagir, tant que l'attaque est ouverte : ses cibles, les
 *   paramètres de réaction proposés, sa réponse ; ni les paramètres de l'attaquant ni ses dés ;
 *   l'attaquant vaut '' s'il ne le voit pas (« Un adversaire vous attaque ») ;
 * - les autres : rien (404).
 */
import type { Attack, AttackTarget, RollStep } from '@vtt/contracts';
import { isOpen, isResolving } from './lifecycle.js';
import type { LoadedAttack, TargetRow } from './repository.js';
import { isAuthor, reactingTargets, type AttackViewer } from './rights.js';

function base(l: LoadedAttack): Omit<Attack, 'targets' | 'redacted'> {
  const a = l.attack;
  return {
    id: a.id,
    campaignId: a.campaignId,
    combatId: a.combatId,
    round: a.round,
    turn: a.turn,
    attackerId: a.attackerId,
    action: { id: a.actionId, name: a.actionName },
    params: a.params,
    rollMode: a.rollMode,
    dice: a.dice,
    visibility: a.visibility,
    status: a.status,
    outOfTurn: a.outOfTurn,
    selfTarget: a.selfTarget,
    origin: a.origin ?? null,
    presetId: a.presetId ?? null,
    adjustments: a.adjustments ?? null,
    actor: a.actor ?? null,
    pendingSteps: a.pendingSteps,
    ...(isResolving(a) ? { resolving: true } : {}),
    note: a.note ?? null,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    decidedAt: a.decidedAt?.toISOString() ?? null,
    version: a.version,
  };
}

const fullTarget = (t: TargetRow): AttackTarget => ({
  characterId: t.characterId,
  status: t.status,
  decision: t.decision,
  reactionParams: t.reactionParams,
  reaction: t.reaction ?? null,
  view: t.view ?? null,
  result: t.result ?? null,
  applied: t.applied ?? null,
  error: t.error ?? null,
});

/** Attaque complète (MJ, événement `combat.attack_resolved`). */
export function fullAttack(l: LoadedAttack): Attack {
  return { ...base(l), targets: l.targets.map(fullTarget), redacted: false };
}

const stepsFor = (steps: RollStep[], keep: (s: RollStep) => boolean) => steps.filter(keep);

/** Vue de l'attaquant (auteur, ou joueur qui incarne l'attaquant). */
export function authorView(l: LoadedAttack, v: AttackViewer): Attack {
  const { actor: _gm, note: _note, ...rest } = base(l);
  return {
    ...rest,
    targets: l.targets
      .filter((t) => v.known.has(t.characterId))
      .map((t) => ({
        characterId: t.characterId,
        status: t.status,
        decision: t.decision,
        view: t.view ?? null,
        error: t.error ?? null,
        // Montants appliqués : seulement à un personnage du camp des joueurs
        ...(v.sideOf.get(t.characterId) === 'players' ? { applied: t.applied ?? null } : {}),
      })),
    // Un dé propre à une cible que l'auteur ne voit plus ne la nomme pas
    pendingSteps: stepsFor(l.attack.pendingSteps, (s) => (s.roller ?? 'author') === 'author').map(
      (s) => ({
        ...s,
        dice: s.dice.map((d) =>
          d.targetId && !v.known.has(d.targetId) ? { ...d, targetId: null } : d,
        ),
      }),
    ),
    redacted: true,
  };
}

/** Vue du joueur d'une cible qui doit réagir. */
export function reactionView(l: LoadedAttack, v: AttackViewer): Attack {
  const mine = reactingTargets(l, v);
  const ids = new Set(mine.map((t) => t.characterId));
  const { actor: _gm, note: _note, ...rest } = base(l);
  return {
    ...rest,
    attackerId: v.known.has(l.attack.attackerId) ? l.attack.attackerId : '',
    params: {},
    adjustments: null,
    targets: mine.map((t) => ({
      characterId: t.characterId,
      status: t.status,
      decision: t.decision,
      reactionParams: t.reactionParams,
      reaction: t.reaction ?? null,
    })),
    pendingSteps: stepsFor(
      l.attack.pendingSteps,
      (s) => s.roller === 'target' && !!s.targetId && ids.has(s.targetId),
    ),
    redacted: true,
  };
}

/** L'attaque vue par cet appelant, ou null s'il ne doit pas la voir. */
export function attackFor(l: LoadedAttack, v: AttackViewer): Attack | null {
  if (v.isGm) return fullAttack(l);
  if (v.spectator) return null;
  if (isAuthor(l, v)) return authorView(l, v);
  if (isOpen(l.attack.status) && reactingTargets(l, v).length) return reactionView(l, v);
  return null;
}
