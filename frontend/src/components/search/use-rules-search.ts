'use client';

/**
 * Données de la recherche ⌘K pour un système : ses règles (réglées avec les options de la
 * campagne, s'il y en a une), son bestiaire de référence et, pour le MJ d'une campagne, les
 * modèles de PNJ de la campagne. Rien n'est chargé tant que la palette est fermée.
 */
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { useMemo } from 'react';
import { useNpcTemplates, useSystemBestiary } from '@/lib/bestiary';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useSystemes } from '@/lib/systemes';
import { creatureItem, templateItem } from '../resources/model/bestiary';
import { buildSearchIndex, type SearchCreature, type SearchIndex } from './model';

export interface RulesSearchData {
  systemId: string;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  index: SearchIndex;
}

export function useRulesSearch(o: {
  systemId: string | null;
  /** Campagne : options de règles, et modèles de PNJ pour son MJ. */
  campaignId: string | null;
  gm: boolean;
  enabled: boolean;
}): { data: RulesSearchData | null; isPending: boolean; isError: boolean } {
  const systemes = useSystemes();
  const resume = systemes.data?.find((s) => s.id === o.systemId);
  const charge = useCampaignSystem(o.enabled ? o.systemId : null, o.campaignId);
  const reference = o.enabled && (resume?.bestiaire ?? 0) > 0;
  const bestiary = useSystemBestiary(o.systemId, reference);
  const templates = useNpcTemplates(o.campaignId, o.enabled && o.gm && o.campaignId !== null);

  const systeme = charge.data?.systeme ?? null;
  const presentation = charge.data?.presentation ?? null;
  const creatures = useMemo((): SearchCreature[] => {
    if (!systeme || !o.systemId) return [];
    const systemId = o.systemId;
    const fromTemplates = (templates.data?.templates ?? []).map((t) => ({
      item: templateItem(systeme, presentation, t, templates.data!.categories),
      placement: {
        key: `template:${t.id}`,
        name: t.name,
        imageUrl: t.tokenUrl ?? t.imageUrl,
        source: { templateId: t.id },
      },
    }));
    const fromReference = (bestiary.data?.creatures ?? []).map((c) => ({
      item: creatureItem(systeme, presentation, c),
      placement: {
        key: `bestiary:${c.id}`,
        name: c.nom,
        imageUrl: c.image ?? null,
        source: { bestiary: { systemeId: systemId, key: c.id } },
      },
    }));
    return [...fromTemplates, ...fromReference];
  }, [systeme, presentation, templates.data, bestiary.data, o.systemId]);

  const index = useMemo(
    () => (systeme ? buildSearchIndex({ systeme, presentation, creatures }) : null),
    [systeme, presentation, creatures],
  );

  return {
    data:
      systeme && index && o.systemId
        ? { systemId: o.systemId, systeme, presentation, index }
        : null,
    isPending: o.enabled && Boolean(o.systemId) && charge.isPending,
    isError: charge.isError,
  };
}
