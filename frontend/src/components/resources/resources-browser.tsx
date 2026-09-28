'use client';

/**
 * Ressources d'un système (docs/ressources.md) : onglets Capacités, Marché, Bestiaire et
 * Images, chacun présent seulement si le système le déclare (`references` de sa
 * présentation). Mêmes composants sur la page de l'accueil et dans le panneau de la table ;
 * seuls les droits changent (bestiaire de campagne pour le MJ, ajout à l'inventaire).
 */
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { BookOpen, ImageIcon, Library, Skull, Store, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BestiaryTab } from './bestiary/bestiary-tab';
import { CatalogueTab } from './catalogue/catalogue-tab';
import { ImagesTab } from './images/images-tab';
import { MarketTab } from './market/market-tab';
import type { InventoryTarget } from './market/use-inventory-target';
import { Notice, ResourcesVariantProvider, type ResourcesVariant } from './parts';

export type ResourceTab = 'capacites' | 'marche' | 'bestiaire' | 'images';

export interface ResourcesAccess {
  /** Campagne dont le MJ voit les modèles de PNJ ; null : pas de bestiaire de campagne. */
  campaignBestiary: string | null;
  /** Le système a un bestiaire de référence (index des systèmes). */
  systemBestiary: boolean;
  /** Joueurs et spectateurs d'une campagne : pas d'onglet Bestiaire du tout. */
  bestiaryAllowed: boolean;
  /** Inventaire où ranger un objet du marché (héros incarné, droit d'écriture). */
  inventory: InventoryTarget | null;
}

const ONGLETS: { id: ResourceTab; label: string; icon: LucideIcon }[] = [
  { id: 'capacites', label: 'Capacités', icon: BookOpen },
  { id: 'marche', label: 'Marché', icon: Store },
  { id: 'bestiaire', label: 'Bestiaire', icon: Skull },
  { id: 'images', label: 'Images', icon: ImageIcon },
];

/** Onglets que ce système déclare, et que ces droits permettent. */
export function availableTabs(
  presentation: Presentation | null,
  access: ResourcesAccess,
): ResourceTab[] {
  const r = presentation?.references;
  return ONGLETS.map((o) => o.id).filter((id) => {
    switch (id) {
      case 'capacites':
        return Boolean(r?.capacites);
      case 'marche':
        return Boolean(r?.marche);
      case 'bestiaire':
        return (
          Boolean(r?.bestiaire) &&
          access.bestiaryAllowed &&
          (access.campaignBestiary !== null || access.systemBestiary)
        );
      case 'images':
        return Boolean(r?.images);
    }
  });
}

export function ResourcesBrowser({
  systemId,
  systeme,
  presentation,
  access,
  variant,
  tab,
  onTabChange,
}: {
  systemId: string;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  access: ResourcesAccess;
  variant: ResourcesVariant;
  /** Onglet ouvert, s'il est tenu par l'appelant (adresse de la page). */
  tab?: ResourceTab | null;
  onTabChange?: (tab: ResourceTab) => void;
}) {
  const onglets = availableTabs(presentation, access);
  const [local, setLocal] = useState<ResourceTab | null>(null);
  const voulu = tab !== undefined ? tab : local;
  const actif = voulu && onglets.includes(voulu) ? voulu : onglets[0];
  const references = presentation?.references;
  const titre = (id: ResourceTab) => {
    const propre =
      id === 'capacites'
        ? references?.capacites?.titre
        : id === 'marche'
          ? references?.marche?.titre
          : id === 'bestiaire'
            ? references?.bestiaire?.titre
            : references?.images?.titre;
    return propre ?? ONGLETS.find((o) => o.id === id)!.label;
  };

  if (!actif)
    return (
      <Notice
        icon={Library}
        title="Aucune ressource"
        description="Ce système ne déclare pas encore de ressources à consulter."
      />
    );

  const changer = (v: string) => {
    const id = v as ResourceTab;
    if (onTabChange) onTabChange(id);
    else setLocal(id);
  };

  return (
    <ResourcesVariantProvider value={variant}>
      <Tabs value={actif} onValueChange={changer}>
        {onglets.length > 1 && (
          <TabsList aria-label="Ressources" className="max-w-full overflow-x-auto">
            {onglets.map((id) => {
              const Icone = ONGLETS.find((o) => o.id === id)!.icon;
              return (
                <TabsTrigger key={id} value={id}>
                  <Icone aria-hidden />
                  {titre(id)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        )}
        {onglets.map((id) => (
          <TabsContent key={id} value={id} className={onglets.length > 1 ? 'mt-5' : 'mt-0'}>
            {id === 'capacites' ? (
              <CatalogueTab systeme={systeme} presentation={presentation} />
            ) : id === 'marche' ? (
              <MarketTab systeme={systeme} presentation={presentation} target={access.inventory} />
            ) : id === 'bestiaire' ? (
              <BestiaryTab
                systemId={systemId}
                systeme={systeme}
                presentation={presentation}
                campaignId={access.campaignBestiary}
                reference={access.systemBestiary}
              />
            ) : (
              <ImagesTab presentation={presentation} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </ResourcesVariantProvider>
  );
}
