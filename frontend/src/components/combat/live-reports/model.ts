/**
 * Pile des rapports en direct sous le bandeau du MJ (docs/combat.md § 12.6) : quels rapports
 * montrer, dans quel ordre, combien. Calculs purs, sans React ni réseau.
 *
 * - À décider (`pending`, au moins une cible ou des coûts à décider) et en cours (réactions ou
 *   dés attendus : carte « en cours » discrète, complétée en place) ;
 * - les plus récents en haut (un rapport qui arrive sort de la barre), sans doublon ;
 * - un rapport que le MJ vient de décider depuis la pile reste le temps de sa confirmation
 *   (`settled`), à sa place, puis s'en va.
 */
import type { Attack } from '@vtt/contracts';
import { actorDecidable, decidableTargets, isOpen, isPending } from '../reports/model';

/** Cartes visibles ; au-delà, « +n ». */
export const LIVE_MAX_VISIBLE = 3;

/** Durée de la confirmation d'une décision (« Appliqué : −7 PV à Gobelin », « Annuler »). */
export const SETTLED_MS = 4_500;

export type LiveKind = 'decide' | 'progress' | 'settled';

export interface LiveItem {
  attack: Attack;
  kind: LiveKind;
}

/** Rapport qui attend vraiment le MJ : une cible ou des coûts de l'attaquant à décider. */
export function needsDecision(a: Attack): boolean {
  return isPending(a) && (decidableTargets(a).length > 0 || actorDecidable(a));
}

/**
 * Cartes de la pile, les plus récentes d'abord. `settled` : rapports décidés depuis la pile,
 * encore en confirmation (ils gardent leur place, même si le serveur les a déjà rangés).
 */
export function liveItems(
  lists: readonly (readonly Attack[])[],
  settled: ReadonlyMap<string, Attack> = new Map(),
): LiveItem[] {
  const byId = new Map<string, Attack>();
  for (const list of lists)
    for (const a of list) {
      const known = byId.get(a.id);
      if (!known || known.version < a.version) byId.set(a.id, a);
    }
  const out: LiveItem[] = [];
  for (const [id, a] of settled) {
    const fresh = byId.get(id);
    // Revenu en attente (application annulée) : la carte redevient à décider
    if (fresh && fresh.version > a.version && needsDecision(fresh)) continue;
    out.push({ attack: fresh && fresh.version > a.version ? fresh : a, kind: 'settled' });
    byId.delete(id);
  }
  for (const a of byId.values()) {
    if (needsDecision(a)) out.push({ attack: a, kind: 'decide' });
    else if (isOpen(a)) out.push({ attack: a, kind: 'progress' });
  }
  return out.sort((x, y) => y.attack.createdAt.localeCompare(x.attack.createdAt));
}

export interface LiveStack {
  visible: LiveItem[];
  /** Rapports repliés dans « +n ». */
  hidden: number;
  /** Rapports qui attendent une décision (pastille). */
  waiting: number;
  /** Premier rapport à décider parmi les cartes visibles (Entrée, Suppr). */
  first: Attack | null;
}

/** Bornes de la pile : `max` cartes visibles, le reste en « +n » ; repliée, aucune carte. */
export function liveStack(
  items: readonly LiveItem[],
  collapsed: boolean,
  max = LIVE_MAX_VISIBLE,
): LiveStack {
  const waiting = items.filter((i) => i.kind === 'decide').length;
  const visible = collapsed ? [] : items.slice(0, Math.max(0, max));
  return {
    visible,
    hidden: items.length - visible.length,
    waiting,
    first: visible.find((i) => i.kind === 'decide')?.attack ?? null,
  };
}
