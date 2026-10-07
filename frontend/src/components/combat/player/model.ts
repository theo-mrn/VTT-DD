/**
 * Ce que voit un joueur du combat (docs/combat.md § 5.3, § 9.3, § 12.6) : calculs purs sur les
 * vues que le serveur lui envoie (combat expurgé, attaque filtrée). On n'y ajoute rien : un
 * personnage que la liste de la campagne ne donne pas au joueur reste « un adversaire ».
 */
import { translate } from '@/i18n/runtime';
import type { Attack, AttackTarget } from '@vtt/contracts';

/** Cibles de l'attaque qui attendent la réaction de l'un de `mine` (toutes pour le MJ). */
export function awaitingMyReaction(
  attack: Attack,
  mine: ReadonlySet<string> | 'all',
): AttackTarget[] {
  if (attack.status !== 'awaiting_reactions') return [];
  return attack.targets.filter(
    (t) => t.status === 'awaiting_reaction' && (mine === 'all' || mine.has(t.characterId)),
  );
}

/**
 * Titre de l'invite de réaction : l'attaquant nommé seulement s'il est connu du joueur (liste
 * filtrée par le service), jamais par son identifiant.
 */
export function reactionTitle(
  attack: Pick<Attack, 'attackerId'>,
  target: Pick<AttackTarget, 'characterId'>,
  names: ReadonlyMap<string, string | null>,
): string {
  const attacker = names.get(attack.attackerId);
  const victim = names.get(target.characterId) ?? translate('map.objects.yourCharacter');
  return attacker
    ? translate('combat.reaction.attacks', { attacker, victim })
    : translate('combat.reaction.opponentAttacks', { victim });
}
