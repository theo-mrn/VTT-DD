'use client';

/**
 * Recherche ⌘K à la table (docs/recherche.md) : les règles du système de la campagne, réglées
 * avec ses options. Le joueur range un objet dans l'inventaire de son héros ; le MJ voit aussi
 * ses modèles de PNJ et pose une créature sur la carte affichée.
 */
import { GENERAL_SHORTCUTS } from '@/lib/shortcuts/catalog';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { useState } from 'react';
import { SearchPalette } from '@/components/search/search-palette';
import { useRulesSearch } from '@/components/search/use-rules-search';
import { useInventoryTarget } from '@/components/resources/market/use-inventory-target';
import { useActiveMap } from '@/lib/map/active-map';
import { useTable } from './contexte';

export function TableSearch() {
  const { campagne, gm, herosId } = useTable();
  const [open, setOpen] = useState(false);
  const rules = useRulesSearch({
    systemId: campagne.system,
    campaignId: campagne.id,
    gm,
    enabled: open,
  });
  const inventory = useInventoryTarget(open ? herosId : null, rules.data?.systeme ?? null);
  const { engine } = useActiveMap(campagne.id);

  useShortcut(GENERAL_SHORTCUTS.search, () => setOpen((o) => !o));

  return (
    <SearchPalette
      open={open}
      onOpenChange={setOpen}
      rules={{ ...rules, inventory, engine: gm ? engine : null }}
    />
  );
}
