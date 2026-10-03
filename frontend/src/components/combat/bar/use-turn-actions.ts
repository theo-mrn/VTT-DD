'use client';

/**
 * Commandes des tours menées depuis la barre du MJ (fiche de combat, ordre déplié) : donner le
 * tour (au personnage, ou au créneau de son camp en mode slots), désigner qui agit dans un
 * créneau, relancer une initiative, cacher, surprendre, mettre hors de combat, réordonner,
 * retirer. Chaque commande appelle sa route ; la réponse remplace l'état du combat.
 */
import type { CombatState } from '@vtt/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { combatFailure, useCombatCommands } from '@/lib/combat/use-combat';
import { currentSlotOf, reorder } from '../turns/model';

export function useTurnActions(campaignId: string, combat: CombatState | null) {
  const commands = useCombatCommands(campaignId);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, label: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
    } catch (err) {
      const message = combatFailure(err);
      if (message) toast.error(label, { description: message });
    } finally {
      setBusy(null);
    }
  };

  const giveTurn = (id: string) => {
    if (!combat) return;
    const slot = currentSlotOf(combat);
    const p = combat.order.find((x) => x.characterId === id);
    // Créneaux : donner la main à un participant du camp du créneau, sinon au créneau suivant
    // de son camp
    if (slot && p) {
      if (p.side === slot.side)
        return void run('turn', 'Le tour n’a pas pu être donné', () =>
          commands.chooseSlotActor({ characterId: id, force: p.hasActed }),
        );
      const slots = combat.slots ?? [];
      const after = slots.findIndex((s, i) => i > slot.index && s.side === p.side);
      const target = after >= 0 ? after : slots.findIndex((s) => s.side === p.side);
      if (target < 0) return;
      return void run('turn', 'Le tour n’a pas pu être donné', () =>
        commands.setTurn({ slotIndex: target, version: combat.version }),
      );
    }
    void run('turn', 'Le tour n’a pas pu être donné', () =>
      commands.setTurn({ characterId: id, version: combat.version }),
    );
  };

  return {
    busy,
    giveTurn,
    /** Créneau choisi dans la suite J/E. */
    setSlot: (slotIndex: number) =>
      combat &&
      void run('turn', 'Le tour n’a pas pu être donné', () =>
        commands.setTurn({ slotIndex, version: combat.version }),
      ),
    /** « Qui agit ? » d'un créneau ; `force` : faire rejouer qui a déjà agi. */
    chooseSlotActor: (characterId: string, force: boolean) =>
      void run('slot', 'Ce participant ne peut pas agir maintenant', () =>
        commands.chooseSlotActor({ characterId, ...(force ? { force: true } : {}) }),
      ),
    reroll: (id: string) => {
      if (!combat) return;
      // Une relance reprend les paramètres de la précédente (compétence choisie…)
      const params = combat.order.find((p) => p.characterId === id)?.initiative?.params;
      void run('reroll', 'L’initiative n’a pas pu être lancée', () =>
        commands.rollParticipantInitiative(id, {
          ...(params && Object.keys(params).length ? { params } : {}),
          dice: 'server',
        }),
      );
    },
    setHidden: (id: string, hidden: boolean) =>
      void run('hidden', 'La visibilité n’a pas pu changer', () =>
        commands.updateParticipant(id, { visibleToPlayers: !hidden }),
      ),
    setSurprised: (id: string, surprised: boolean) =>
      void run('surprised', 'La surprise n’a pas pu changer', () =>
        commands.updateParticipant(id, { surprised }),
      ),
    setDefeated: (id: string, defeated: boolean) =>
      void run('defeated', 'L’état n’a pas pu changer', () =>
        commands.updateParticipant(id, { defeated }),
      ),
    move: (id: string, to: number) => {
      if (!combat) return;
      const ids = combat.order.map((p) => p.characterId);
      void run('order', 'L’ordre n’a pas pu changer', () =>
        commands.reorder({ order: reorder(ids, id, to), version: combat.version }),
      );
    },
    remove: (id: string) =>
      void run('remove', 'Le participant n’a pas pu être retiré', () =>
        commands.removeParticipant(id),
      ),
  };
}

export type TurnActions = ReturnType<typeof useTurnActions>;
