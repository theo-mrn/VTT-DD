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

import { useQueries, useQuery } from '@tanstack/react-query';
import type { CampaignSide } from '@vtt/contracts';
import { calculer, type Fiche, type Presentation, type SystemeCharge } from '@vtt/rules';
import { useMemo, useRef } from 'react';
import { mainResource } from '@/components/map/tokens/resource';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { campagnes, clePersonnagesCampagne } from '@/lib/campagnes';
import type { ResourceGauge } from '@/lib/map/modules/tokens/model';
import { clesPersonnages, personnages, type FichePersonnage } from '@/lib/personnages';

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
export const UNKNOWN_NAME = 'Personnage';

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
        name: c.name ?? UNKNOWN_NAME,
        portraitUrl: c.avatarUrl,
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
    nameOf: (id: string) => byId.get(id)?.name ?? UNKNOWN_NAME,
  };
}

// ─── Présentation du combat (données du système) ────────────────────────────

/**
 * Partie `combat` de la présentation (docs/combat.md § 14), lue sans supposer qu'elle existe :
 * un système qui ne la déclare pas n'a pas d'états à proposer (état libre seulement).
 */
export function combatPresentation(presentation: Presentation | null | undefined): {
  stateSorts: string[];
} {
  const combat = (presentation as { combat?: { etats?: { sortes?: unknown } } } | null)?.combat;
  const sorts = combat?.etats?.sortes;
  return {
    stateSorts: Array.isArray(sorts) ? sorts.filter((s): s is string => typeof s === 'string') : [],
  };
}

/** Mode d'initiative déclaré par le système (`initiative.mode`), s'il le déclare. */
export function systemInitiativeMode(systeme: SystemeCharge | null | undefined) {
  const mode = (systeme?.source.initiative as { mode?: unknown } | undefined)?.mode;
  return mode === 'creneaux' ? 'slots' : mode === 'individuel' ? 'individual' : null;
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
  /** Rounds restants ; null : jusqu'au retrait. */
  duration: number | null;
}

/** Source des états libres posés depuis le panneau Combat (bonus sans effet, nommé). */
export const FREE_STATE_SOURCE = 'État';

/**
 * États d'une fiche : entrées des sortes d'états du système, possessions à durée, bonus libres
 * à durée ou posés comme état libre.
 */
export function statesOf(
  sheet: Pick<FichePersonnage, 'state'>,
  systeme: SystemeCharge,
  stateSorts: readonly string[],
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
      duration: b.duree ?? null,
    });
  }
  return out;
}

// ─── Fiches des participants ─────────────────────────────────────────────────

export interface ParticipantSheet {
  sheet: FichePersonnage;
  fiche: Fiche | null;
  gauge: ResourceGauge | null;
  states: TimedState[];
}

const dataOf = (results: readonly { data?: FichePersonnage | undefined }[]) =>
  results.map((r) => r.data);

/**
 * Fiches des participants (MJ : toutes), calculées une fois par version de fiche. Le cache est
 * celui de la fiche : une écriture ou un `character.updated` les met à jour.
 */
export function useParticipantSheets(
  campaignId: string,
  systemId: string,
  ids: readonly string[],
): { sheets: ReadonlyMap<string, ParticipantSheet>; systeme: SystemeCharge | null } {
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
    const { stateSorts } = combatPresentation(s.presentation);
    for (const sheet of sheets) {
      if (!sheet) continue;
      const known = cache.current.get(sheet);
      if (known && known.sys === s) {
        map.set(sheet.id, known.value);
        continue;
      }
      let fiche: Fiche | null = null;
      let gauge: ResourceGauge | null = null;
      try {
        fiche = calculer(s.systeme, sheet.state);
        gauge = mainResource({
          systeme: s.systeme,
          presentation: s.presentation,
          fiche,
          personnage: { id: sheet.id, name: sheet.name, roomId: campaignId },
          mj: true,
        });
      } catch {
        fiche = null;
      }
      const value = { sheet, fiche, gauge, states: statesOf(sheet, s.systeme, stateSorts) };
      cache.current.set(sheet, { sys: s, value });
      map.set(sheet.id, value);
    }
    return map;
  }, [sheets, sys.data, campaignId]);

  return { sheets: out, systeme: sys.data?.systeme ?? null };
}
