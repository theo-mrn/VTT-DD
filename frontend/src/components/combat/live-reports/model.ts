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
  const byId = latestById(lists);
  const out: LiveItem[] = [];
  for (const [id, a] of settled) {
    const fresh = byId.get(id);
    const newer = fresh && fresh.version > a.version ? fresh : null;
    // Revenu en attente (application annulée) : la carte redevient à décider
    if (newer && needsDecision(newer)) continue;
    out.push({ attack: newer ?? a, kind: 'settled' });
    byId.delete(id);
  }
  for (const a of byId.values()) {
    const kind = liveKind(a);
    if (kind) out.push({ attack: a, kind });
  }
  return out.sort((x, y) => y.attack.createdAt.localeCompare(x.attack.createdAt));
}

/** Dernière version connue de chaque attaque, toutes listes confondues. */
function latestById(lists: readonly (readonly Attack[])[]): Map<string, Attack> {
  const byId = new Map<string, Attack>();
  for (const list of lists)
    for (const a of list) {
      const known = byId.get(a.id);
      if (!known || known.version < a.version) byId.set(a.id, a);
    }
  return byId;
}

/** Carte d'une attaque de la pile : à décider, en cours, ou rien (rangée). */
function liveKind(a: Attack): 'decide' | 'progress' | null {
  if (needsDecision(a)) return 'decide';
  return isOpen(a) ? 'progress' : null;
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

/**
 * Carte dépliée de la pile : celle que le MJ a choisie si elle attend encore une décision, sinon
 * la première à décider. Les autres restent en lignes compactes (décision en un clic).
 */
export function focusOf(stack: LiveStack, chosen: string | null): string | null {
  if (chosen && stack.visible.some((i) => i.kind === 'decide' && i.attack.id === chosen))
    return chosen;
  return stack.first?.id ?? null;
}
