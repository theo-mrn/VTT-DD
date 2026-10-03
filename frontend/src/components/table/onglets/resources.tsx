'use client';

import { AlertTriangle } from 'lucide-react';
import { ListSkeleton, Notice } from '@/components/resources/parts';
import { ResourcesBrowser } from '@/components/resources/resources-browser';
import { useInventoryTarget } from '@/components/resources/market/use-inventory-target';
import { Button } from '@/components/ui/button';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useSystemes } from '@/lib/systemes';
import { useTable } from '../contexte';

/**
 * Ressources de la campagne (docs/ressources.md) : celles du système de la campagne, réglé
 * avec ses options. Bestiaire au MJ seul (modèles de PNJ de la campagne et référence du
 * système) ; « Ajouter à l'inventaire » du marché sur la fiche du héros incarné, si elle est
 * modifiable par l'utilisateur.
 */
export function OngletResources() {
  const { campagne, gm, herosId } = useTable();
  const systemes = useSystemes();
  const systeme = useCampaignSystem(campagne.system, campagne.id);
  const inventory = useInventoryTarget(herosId, systeme.data?.systeme ?? null);
  const resume = systemes.data?.find((s) => s.id === campagne.system);

  return (
    <div className="px-4 py-5 sm:px-6">
      {systeme.isPending && <ListSkeleton />}
      {!systeme.isPending && (systeme.isError || !systeme.data) && (
        <Notice
          tone="error"
          icon={AlertTriangle}
          title="Système indisponible"
          description="Les règles de la campagne n’ont pas pu être chargées."
          action={
            <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
              Recharger
            </Button>
          }
        />
      )}
      {!systeme.isPending && !systeme.isError && systeme.data && (
        <ResourcesBrowser
          systemId={campagne.system}
          systeme={systeme.data.systeme}
          presentation={systeme.data.presentation}
          variant="panel"
          access={{
            campaignBestiary: gm ? campagne.id : null,
            systemBestiary: (resume?.bestiaire ?? 0) > 0,
            bestiaryAllowed: gm,
            inventory,
          }}
        />
      )}
    </div>
  );
}
