/**
 * Qui est qui dans le combat, vu du MJ : les personnages engagés de la campagne (nom,
 * portrait, camp, joueur qui l'incarne) et, pour les participants, leur fiche calculée par
 * `@vtt/rules` (ressource principale, états et bonus à durée). Lecture seule : les écritures
 * passent par la fiche (`useOperationsPersonnage`), le cache est partagé avec elle.
 *
 * Aucune clé de jeu : la ressource principale est celle de la présentation du système
 * (`mainResource`), les états sont les entrées des sortes que la présentation déclare pour le
 * combat (`combat.etats.sortes`), plus tout ce qui porte une durée.
 */
'use client';

import { translate } from '@/i18n/runtime';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { CampaignSide } from '@vtt/contracts';
import type { Fiche, IconeEtat, Presentation, SystemeCharge } from '@vtt/rules';
import { useMemo, useRef } from 'react';
import {
  estRessource,
  visiblePour,
  widgetsDe,
  type ContexteFiche,
} from '@/components/fiche/widgets';
import { mainResource } from '@/lib/map/features/tokens/ui/resource';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { campagnes, clePersonnagesCampagne } from '@/lib/campagnes';
import { stateIconOf, stateIconsOf } from '@/lib/combat/state-icons';
import type { ResourceGauge } from '@/lib/map/features/tokens/engine/model';
import { clesPersonnages, personnages, type FichePersonnage } from '@/lib/personnages';
import { calculerMemo } from '@/lib/rules-cache';

export interface CastMember {
  id: string;
  name: string;
  portraitUrl: string | null;
  side: CampaignSide;
  kind: 'pc' | 'npc' | null;
  playedBy: string | null;
  type: string | null;
  inCreation: boolean;
}

/** Nom d'un personnage que la liste ne connaît pas (encore) : jamais un identifiant brut. */
export const unknownName = () => translate('map.common.character');

/** Personnages engagés de la campagne (PNJ compris pour le MJ, filtrés par le service). */
export function useCast(campaignId: string) {
  const list = useQuery({
    queryKey: clePersonnagesCampagne(campaignId),
    queryFn: () => campagnes.personnages(campaignId),
  });
  const members = useMemo<CastMember[]>(
    () =>
      (list.data ?? []).map((c) => ({
        id: c.characterId,
        name: c.name ?? unknownName(),
        // Sans portrait (PNJ du bestiaire, d'un modèle) : son token du Studio, sinon son image
        // sur la carte
        portraitUrl: c.avatarUrl ?? c.tokenUrl ?? c.mapImageUrl ?? null,
        side: c.side,
        kind: c.kind,
        playedBy: c.playedBy,
        type: c.type,
        inCreation: c.inCreation,
      })),
    [list.data],
  );
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  return {
    members,
    byId,
    isLoading: list.isPending,
    isError: list.isError,
    error: list.error,
    nameOf: (id: string) => byId.get(id)?.name ?? unknownName(),
  };
}

// ─── Présentation du combat (données du système) ────────────────────────────

/**
 * Partie `combat` de la présentation (docs/combat.md § 14), lue sans supposer qu'elle existe :
 * un système qui ne la déclare pas n'a pas d'états à proposer (état libre seulement).
 */
export function combatPresentation(presentation: Presentation | null | undefined): {
  stateSorts: string[];
  /** Icône de chaque état déclarée par la présentation (`combat.etats.icones`). */
  stateIcons: Readonly<Record<string, IconeEtat>>;
} {
  const combat = (presentation as { combat?: { etats?: { sortes?: unknown } } } | null)?.combat;
  const sorts = combat?.etats?.sortes;
  return {
    stateSorts: Array.isArray(sorts) ? sorts.filter((s): s is string => typeof s === 'string') : [],
    stateIcons: stateIconsOf(presentation),
  };
}

/** Mode d'initiative déclaré par le système (`initiative.mode`), s'il le déclare. */
export function systemInitiativeMode(systeme: SystemeCharge | null | undefined) {
  const mode = (systeme?.source.initiative as { mode?: unknown } | undefined)?.mode;
  if (mode === 'creneaux') return 'slots';
  return mode === 'individuel' ? 'individual' : null;
}

// ─── États d'un participant ──────────────────────────────────────────────────

export interface TimedState {
  /** Clé stable de la ligne. */
  key: string;
  kind: 'entry' | 'bonus';
  /** Entrée du catalogue (état), et son exemplaire. */
  entry?: string;
  instance?: string;
  /** Bonus libre (état libre). */
  bonusId?: string;
  name: string;
  /** Icône de l'état (présentation), l'icône générique pour un état libre. */
  icon: IconeEtat;
  /** Rounds restants ; null : jusqu'au retrait. */
  duration: number | null;
}

/** Source des états libres posés depuis le panneau Combat (bonus sans effet, nommé). */
export const FREE_STATE_SOURCE = 'État'; // i18n-ignore : source enregistrée dans la fiche (donnée)

/**
 * États d'une fiche : entrées des sortes d'états du système, possessions à durée, bonus libres
 * à durée ou posés comme état libre.
 */
export function statesOf(
  sheet: Pick<FichePersonnage, 'state'>,
  systeme: SystemeCharge,
  stateSorts: readonly string[],
  stateIcons: Readonly<Record<string, IconeEtat>> = {},
): TimedState[] {
  const sorts = new Set(stateSorts);
  const out: TimedState[] = [];
  for (const p of sheet.state.possessions ?? []) {
    const entry = systeme.entrees.get(p.entree);
    const isState = (entry && sorts.has(entry.sorte)) || p.duree !== undefined;
    if (!isState) continue;
    out.push({
      key: `entry:${p.entree}#${p.exemplaire ?? ''}`,
      kind: 'entry',
      entry: p.entree,
      instance: p.exemplaire,
      name: entry?.nom ?? p.entree,
      icon: stateIconOf(stateIcons, p.entree),
      duration: p.duree ?? null,
    });
  }
  for (const b of sheet.state.bonus ?? []) {
    if (b.duree === undefined && b.source !== FREE_STATE_SOURCE) continue;
    out.push({
      key: `bonus:${b.id}`,
      kind: 'bonus',
      bonusId: b.id,
      name: b.nom,
      icon: stateIconOf(stateIcons, null),
      duration: b.duree ?? null,
    });
  }
  return out;
}

// ─── Fiches des participants ─────────────────────────────────────────────────

/**
 * Valeur clé d'un personnage pour les cartes compactes : celles du premier bloc « ressources »
 * de la présentation (PV et Défense, Blessures et Stress…), l'ancien « DEF · PV ».
 */
export interface KeyStat {
  key: string;
  label: string;
  /** Texte affiché : « 12 / 20 » pour une ressource, la valeur sinon. */
  value: string;
  /** Ressource : part (0 à 1), couleur de la présentation, jauge qui se remplit. */
  gauge: { ratio: number; color: string | null; rising: boolean } | null;
}

/** Valeurs clés d'une fiche calculée (trois au plus), visibles de ce viewer. */
export function keyStatsOf(ctx: ContexteFiche, max = 3): KeyStat[] {
  const { fiche } = ctx;
  const bloc = widgetsDe(ctx).find((w) => w.type === 'ressources');
  const keys =
    bloc?.type === 'ressources'
      ? bloc.attributs
      : [...fiche.entite.attributs.values()]
          .filter((a) => a.nature === 'ressource')
          .map((a) => a.cle);
  const out: KeyStat[] = [];
  for (const key of keys) {
    if (out.length >= max) break;
    const stat = keyStatOf(ctx, key);
    if (stat) out.push(stat);
  }
  return out;
}

/** Valeur clé d'un attribut visible : jauge pour une ressource, valeur sinon ; vide : null. */
function keyStatOf(ctx: ContexteFiche, key: string): KeyStat | null {
  const { fiche, presentation } = ctx;
  const a = fiche.entite.attributs.get(key);
  const v = fiche.valeurs.get(key);
  if (!a || !v || !visiblePour(ctx, key)) return null;
  const label = a.abrege ?? a.nom;
  if (estRessource(ctx, key) && typeof v.valeur === 'number') {
    const top = typeof v.max === 'number' ? v.max : v.valeur;
    const look = presentation?.ressources[key];
    return {
      key,
      label,
      value: `${v.valeur} / ${top}`,
      gauge: {
        ratio: top > 0 ? Math.max(0, Math.min(1, v.valeur / top)) : 0,
        color: look?.couleur ?? null,
        rising: look?.sens === 'montant',
      },
    };
  }
  if (v.valeur !== undefined && v.valeur !== '')
    return { key, label, value: String(v.valeur), gauge: null };
  return null;
}

export interface ParticipantSheet {
  sheet: FichePersonnage;
  fiche: Fiche | null;
  gauge: ResourceGauge | null;
  /** Valeurs clés de la présentation (cartes compactes). */
  keyStats: KeyStat[];
  states: TimedState[];
}

const dataOf = (results: readonly { data?: FichePersonnage }[]) => results.map((r) => r.data);

/**
 * Fiches des participants (MJ : toutes), calculées une fois par version de fiche. Le cache est
 * celui de la fiche : une écriture ou un `character.updated` les met à jour.
 */
export function useParticipantSheets(
  campaignId: string,
  systemId: string,
  ids: readonly string[],
): {
  sheets: ReadonlyMap<string, ParticipantSheet>;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
} {
  const sys = useCampaignSystem(systemId, campaignId);
  const sheets = useQueries({
    queries: ids.map((id) => ({
      queryKey: clesPersonnages.un(id),
      queryFn: () => personnages.lire(id),
      staleTime: 30_000,
      retry: false,
    })),
    combine: dataOf,
  });
  const cache = useRef(new WeakMap<FichePersonnage, { sys: unknown; value: ParticipantSheet }>());

  const out = useMemo(() => {
    const map = new Map<string, ParticipantSheet>();
    const s = sys.data;
    if (!s) return map;
    const { stateSorts, stateIcons } = combatPresentation(s.presentation);
    for (const sheet of sheets) {
      if (!sheet) continue;
      const known = cache.current.get(sheet);
      if (known && known.sys === s) {
        map.set(sheet.id, known.value);
        continue;
      }
      let fiche: Fiche | null = null;
      let gauge: ResourceGauge | null = null;
      let keyStats: KeyStat[] = [];
      try {
        fiche = calculerMemo(s.systeme, sheet.state);
        const personnage = { id: sheet.id, name: sheet.name, roomId: campaignId };
        gauge = mainResource({
          systeme: s.systeme,
          presentation: s.presentation,
          fiche,
          personnage,
          mj: true,
        });
        keyStats = keyStatsOf({
          systeme: s.systeme,
          presentation: s.presentation,
          fiche,
          personnage,
          mj: true,
        });
      } catch {
        fiche = null;
      }
      const value = {
        sheet,
        fiche,
        gauge,
        keyStats,
        states: statesOf(sheet, s.systeme, stateSorts, stateIcons),
      };
      cache.current.set(sheet, { sys: s, value });
      map.set(sheet.id, value);
    }
    return map;
  }, [sheets, sys.data, campaignId]);

  return {
    sheets: out,
    systeme: sys.data?.systeme ?? null,
    presentation: sys.data?.presentation ?? null,
  };
}
