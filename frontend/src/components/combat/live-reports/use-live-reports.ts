'use client';

/**
 * État et commandes des rapports en direct du MJ (docs/combat.md § 12.6), partagés par la barre
 * (pastille, repli) et la pile (cartes, décisions). Les décisions passent par les mêmes corps
 * que le panneau Combat (`reports/model.ts`) ; les commandes par `use-attacks.ts`.
 */
import type { Attack, AttackTarget } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePanelStore } from '@/components/table/panels/store';
import type { DetailCampagne } from '@/lib/campagnes';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { combatErrorMessage } from '@/lib/combat/api';
import { useAttackCommands, useAttacks } from '@/lib/combat/use-attacks';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { reportDefeated } from '../reports/defeated-dialog';
import { modificationText } from '../reports/labels';
import {
  actorDecidable,
  buildApply,
  decidableTargets,
  defeatedBy,
  draftOf,
  revertConflictOf,
  toInput,
} from '../reports/model';
import { useCast, type CastMember } from '../turns/use-cast';
import { focusOf, liveItems, liveStack, SETTLED_MS, type LiveItem, type LiveStack } from './model';

export type Cast = ReadonlyMap<string, CastMember>;

/** Portée d'une décision : des cibles telles quelles, et les coûts de l'attaquant ou non. */
export interface Scope {
  targets: readonly AttackTarget[];
  actor: boolean;
}

/** Rapport décidé depuis la pile, le temps de sa confirmation. */
export interface Settled {
  attack: Attack;
  message: string;
  applied: boolean;
}

/** Clé d'une commande en cours (bouton qui tourne) : attaque, cibles, coûts, appliquer. */
export const scopeKey = (a: Attack, s: Scope, apply: boolean) =>
  `${a.id}:${s.targets.map((t) => t.characterId).join(',')}:${s.actor}:${apply}`;

export interface LiveReports {
  campaignId: string;
  cast: Cast;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  items: LiveItem[];
  stack: LiveStack;
  /** Carte dépliée (les autres en lignes compactes). */
  focus: string | null;
  setFocus(id: string | null): void;
  settled: ReadonlyMap<string, Settled>;
  /** Commande en cours (`scopeKey`, `<id>:server`, `<id>:cancel`, `<id>:undo`). */
  busy: string | null;
  collapsed: boolean;
  setCollapsed(v: boolean): void;
  /** Le panneau Combat est ouvert : il montre déjà les rapports, la pile s'efface. */
  panelOpen: boolean;
  /** Rapport ouvert dans le tiroir « Modifier ». */
  deciding: Attack | null;
  setDeciding(id: string | null): void;
  decide(a: Attack, scope: Scope, apply: boolean): Promise<void>;
  /** Le serveur tire tout ce qui reste (auteur parti). */
  rollRest(a: Attack): Promise<void>;
  cancel(a: Attack): Promise<void>;
  undo(s: Settled): Promise<void>;
  forget(id: string): void;
}

export function useLiveReports(campagne: DetailCampagne): LiveReports {
  const campaignId = campagne.id;
  const panelOpen = usePanelStore((s) => s.active === 'combat');
  const pending = useAttacks(campaignId, { status: 'pending', limit: 100 });
  const open = useAttacks(campaignId, { status: 'open', limit: 50 });
  const cast = useCast(campaignId);
  const sys = useCampaignSystem(campagne.system, campaignId);
  const systeme = sys.data?.systeme ?? null;
  const presentation = sys.data?.presentation ?? null;
  const commands = useAttackCommands(campaignId);
  const [collapsed, setCollapsed] = usePreferenceLocale('combat:pile-rapports-repliee', false);
  const [settled, setSettled] = useState<ReadonlyMap<string, Settled>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [decidingId, setDeciding] = useState<string | null>(null);
  const [chosen, setFocus] = useState<string | null>(null);

  const settledAttacks = useMemo(
    () => new Map([...settled].map(([id, s]) => [id, s.attack])),
    [settled],
  );
  const items = useMemo(
    () => liveItems([open.attacks, pending.attacks], settledAttacks),
    [open.attacks, pending.attacks, settledAttacks],
  );
  const stack = liveStack(items, collapsed);
  const focus = focusOf(stack, chosen);
  // La carte dépliée le reste : un rapport qui arrive se range en ligne au-dessus, sans
  // replier celle que le MJ lit (ni déplacer le bouton qu'il allait cliquer)
  useEffect(() => {
    if (focus && focus !== chosen) setFocus(focus);
  }, [focus, chosen]);
  const deciding = decidingId
    ? (items.find((i) => i.attack.id === decidingId)?.attack ?? null)
    : null;

  // Une confirmation s'en va d'elle-même
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const forget = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setSettled((s) => {
      const next = new Map(s);
      next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  const nameOf = (id: string) => cast.byId.get(id)?.name ?? 'Personnage';

  const decide = async (a: Attack, scope: Scope, apply: boolean) => {
    setBusy(scopeKey(a, scope, apply));
    try {
      const actor =
        scope.actor && actorDecidable(a)
          ? { apply, modifications: a.actor!.modifications.map(toInput) }
          : null;
      const updated = await commands.apply(
        a.id,
        buildApply(
          a,
          scope.targets.map((t) => ({ ...draftOf(t), apply })),
          actor,
        ),
      );
      reportDefeated(defeatedBy(updated));
      if (updated.status !== 'pending') {
        const message = settledMessage(updated, nameOf, systeme, cast.byId);
        setSettled((s) => new Map(s).set(a.id, { attack: updated, ...message }));
        clearTimeout(timers.current.get(a.id));
        timers.current.set(
          a.id,
          setTimeout(() => forget(a.id), SETTLED_MS),
        );
      }
    } catch (err) {
      toast.error('La décision n’a pas pu être appliquée', {
        description: combatErrorMessage(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const rollRest = async (a: Attack) => {
    const step = a.pendingSteps[0];
    if (!step) return;
    setBusy(`${a.id}:server`);
    try {
      await commands.submitDice(a.id, { stepId: step.id, results: [], serverFallback: true });
    } catch (err) {
      toast.error('Les dés n’ont pas pu être tirés', { description: combatErrorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (a: Attack) => {
    setBusy(`${a.id}:cancel`);
    try {
      await commands.cancel(a.id, { version: a.version });
    } catch (err) {
      toast.error('L’attaque n’a pas pu être abandonnée', {
        description: combatErrorMessage(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const undo = async (s: Settled) => {
    setBusy(`${s.attack.id}:undo`);
    try {
      await commands.revert(s.attack.id, { version: s.attack.version });
      forget(s.attack.id);
    } catch (err) {
      toast.error('L’application n’a pas pu être annulée', {
        description: revertConflictOf(err)
          ? 'La fiche a changé entre-temps : voyez le panneau Combat.'
          : combatErrorMessage(err),
      });
    } finally {
      setBusy(null);
    }
  };

  return {
    campaignId,
    cast: cast.byId,
    systeme,
    presentation,
    items,
    stack,
    focus,
    setFocus,
    settled,
    busy,
    collapsed,
    setCollapsed,
    panelOpen,
    deciding,
    setDeciding,
    decide,
    rollRest,
    cancel,
    undo,
    forget,
  };
}

/** Tout ce qui reste à décider d'un rapport : ses cibles décidables et les coûts. */
export const wholeScope = (a: Attack): Scope => ({ targets: decidableTargets(a), actor: true });

/** « Appliqué : −7 PV à Gobelin », « Non appliqué », « Rapport écarté ». */
function settledMessage(
  a: Attack,
  nameOf: (id: string) => string,
  systeme: SystemeCharge | null,
  cast: Cast,
): { message: string; applied: boolean } {
  const parts = a.targets.flatMap((t) => {
    if (t.decision !== 'applied' || !t.applied) return [];
    const who = t.applied.redirectedTo ?? t.characterId;
    const values = t.applied.modifications
      .filter((m) => m.kind === 'attribute')
      .map((m) => modificationText(systeme, toInput(m), cast.get(who)?.type));
    return [`${values.length ? values.join(', ') : 'effets'} à ${nameOf(who)}`];
  });
  if (parts.length) return { message: `Appliqué : ${parts.join(' · ')}`, applied: true };
  if (a.status === 'dismissed') return { message: 'Rapport écarté', applied: false };
  return { message: 'Non appliqué', applied: false };
}
