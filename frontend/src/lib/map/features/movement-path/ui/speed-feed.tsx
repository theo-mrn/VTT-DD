'use client';

/**
 * Déplacement des personnages pour le trajet (docs/carte.md § 10, Trajet des déplacements) :
 * surcouche sans rendu qui lit l'attribut déclaré par la présentation du système
 * (`carte.deplacement.attribut`) dans les fiches calculées par `@vtt/rules`, et le pousse au
 * moteur. Aucune clé de jeu dans le code ; sans déclaration, rien n'est lu.
 *
 * Mêmes fiches que l'annuaire des tokens (même cache, aucune requête de plus) : MJ, tous les
 * personnages posés ; joueur, les siens. Un attribut réservé au MJ n'est pas lu pour un joueur.
 */
import { useQueries } from '@tanstack/react-query';
import { compareCodeUnits } from '@vtt/contracts';
import { useEffect, useMemo } from 'react';
import { useMapState } from '@/components/map/engine-context';
import { visiblePour } from '@/components/fiche/widgets';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useCampagne } from '@/lib/campagnes';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { clesPersonnages, personnages, type FichePersonnage } from '@/lib/personnages';
import { calculerMemo } from '@/lib/rules-cache';
import { speedDirectory } from '../engine/speeds';

const EMPTY: ReadonlyMap<string, unknown> = new Map();
const NONE: readonly string[] = [];

/** Données des fiches (fonction stable : TanStack ne recombine que si une fiche change). */
const dataOf = (results: readonly { data?: FichePersonnage }[]) => results.map((r) => r.data);

export function SpeedFeed({ engine }: Readonly<{ engine: MapEngine }>) {
  const campaignId = engine.store.getState().campaignId;
  const gm = engine.viewer.role === 'gm';
  const mine = engine.viewer.characterIds;
  const campagne = useCampagne(campaignId);
  const sys = useCampaignSystem(campagne.data?.system, campaignId);
  const attribut = sys.data?.presentation?.carte?.deplacement?.attribut ?? null;

  // Personnages posés dont ce viewer a la fiche (aucune si le système ne déclare rien)
  const tokenMap = useMapState((s) => s.collections.tokens ?? EMPTY);
  const sheetIds = useMemo(() => {
    if (!attribut) return NONE;
    const ids = new Set<string>();
    for (const t of tokenMap.values()) {
      const id = (t as { characterId?: unknown; draft?: unknown }).characterId;
      if (typeof id === 'string' && !(t as { draft?: unknown }).draft) ids.add(id);
    }
    return [...ids].filter((id) => gm || mine.includes(id)).sort(compareCodeUnits);
  }, [attribut, tokenMap, gm, mine]);

  const sheets = useQueries({
    queries: sheetIds.map((id) => ({
      queryKey: clesPersonnages.un(id),
      queryFn: () => personnages.lire(id),
      staleTime: 30_000,
      retry: false,
    })),
    combine: dataOf,
  });

  const speeds = useMemo(() => {
    const out = new Map<string, number>();
    const s = sys.data;
    if (!s || !attribut) return out;
    for (const fiche of sheets) {
      if (!fiche) continue;
      try {
        const calculee = calculerMemo(s.systeme, fiche.state);
        if (!calculee.entite.attributs.has(attribut)) continue;
        if (!visiblePour({ fiche: calculee, mj: gm }, attribut)) continue;
        const valeur = calculee.valeurs.get(attribut)?.valeur;
        if (typeof valeur === 'number' && Number.isFinite(valeur) && valeur > 0)
          out.set(fiche.id, valeur);
      } catch {
        // Fiche illisible avec ce système : pas de déplacement connu
      }
    }
    return out;
  }, [sheets, sys.data, attribut, gm]);

  useEffect(() => {
    speedDirectory(engine).replace(speeds);
  }, [engine, speeds]);

  return null;
}
