'use client';

/**
 * Ordre du tour complet, déplié sous la barre du MJ (« +n », nom de qui agit ; docs/combat.md
 * § 12.6) : en créneaux, la suite J/E (un clic y donne le tour) et « Qui agit ? » tant que le
 * créneau n'a pas d'acteur ; puis toutes les lignes (`OrderList` : glisser pour réordonner,
 * « + » ressources, menu de ligne). Les fiches ne se lisent qu'à l'ouverture.
 */
import type { CombatState } from '@vtt/contracts';
import { motion } from 'motion/react';
import type { DetailCampagne } from '@/lib/campagnes';
import { useAttackHost } from '@/lib/combat/attack-menu-store';
import { currentActorId } from '@/lib/combat/use-combat';
import { currentSlotOf, slotCandidates } from '../turns/model';
import { OrderList } from '../turns/order-list';
import { SlotPickCard } from '../turns/side-cards';
import { SlotBar } from '../turns/slot-bar';
import { useCast, useParticipantSheets } from '../turns/use-cast';
import type { TurnActions } from './use-turn-actions';

export function OrderContent({
  campagne,
  combat,
  turns,
  onOpen,
  onAttack,
}: {
  campagne: DetailCampagne;
  combat: CombatState;
  turns: TurnActions;
  /** Fiche de combat d'un participant. */
  onOpen(characterId: string): void;
  onAttack(characterId: string): void;
}) {
  const cast = useCast(campagne.id);
  const canAttack = useAttackHost(campagne.id);
  const ids = combat.order.map((p) => p.characterId);
  const { sheets } = useParticipantSheets(campagne.id, campagne.system, ids);
  const slot = currentSlotOf(combat);
  const busy = turns.busy !== null;
  const picking = slot && !currentActorId(combat);

  return (
    <div className="flex max-h-[min(70dvh,40rem)] flex-col gap-1.5">
      {combat.mode === 'slots' && (
        <div className="space-y-2 px-1.5 pt-1.5">
          <SlotBar combat={combat} busy={busy} onSlot={(i) => turns.setSlot(i)} />
          {picking && (
            <SlotPickCard
              side={slot.side}
              candidates={slotCandidates(combat)}
              cast={cast.byId}
              busy={busy}
              onChoose={turns.chooseSlotActor}
            />
          )}
        </div>
      )}
      {/* `layoutScroll` : les lignes qui changent de place s'animent juste, liste défilée */}
      <motion.div layoutScroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <OrderList
          combat={combat}
          cast={cast.byId}
          sheets={sheets}
          busy={busy}
          consulted={null}
          canAttack={canAttack}
          followCurrent
          actions={{
            consult: onOpen,
            open: onOpen,
            attackWith: onAttack,
            giveTurn: turns.giveTurn,
            reroll: turns.reroll,
            setHidden: turns.setHidden,
            setSurprised: turns.setSurprised,
            setDefeated: turns.setDefeated,
            move: turns.move,
            remove: turns.remove,
          }}
        />
      </motion.div>
    </div>
  );
}
