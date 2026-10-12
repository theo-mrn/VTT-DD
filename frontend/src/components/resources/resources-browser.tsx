'use client';

/**
 * Ressources d'un système (docs/ressources.md) : onglets Capacités, Marché, Bestiaire et
 * Images, chacun présent seulement si le système le déclare (`references` de sa
 * présentation). Mêmes composants sur la page de l'accueil et dans le panneau de la table ;
 * seuls les droits changent (bestiaire de campagne pour le MJ, ajout à l'inventaire).
 */
import { useTranslations } from 'next-intl';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { BookOpen, ImageIcon, Library, Skull, Store, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { cn } from '@/lib/utils';
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

/** Onglets ; nom par défaut : `resources.tabs.<id>` (le système peut nommer les siens). */
const ONGLETS: { id: ResourceTab; icon: LucideIcon }[] = [
  { id: 'capacites', icon: BookOpen },
  { id: 'marche', icon: Store },
  { id: 'bestiaire', icon: Skull },
  { id: 'images', icon: ImageIcon },
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
}: Readonly<{
  systemId: string;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  access: ResourcesAccess;
  variant: ResourcesVariant;
  /** Onglet ouvert, s'il est tenu par l'appelant (adresse de la page). */
  tab?: ResourceTab | null;
  onTabChange?: (tab: ResourceTab) => void;
}>) {
  const t = useTranslations();
  const onglets = availableTabs(presentation, access);
  const [local, setLocal] = useState<ResourceTab | null>(null);
  const voulu = tab !== undefined ? tab : local;
  const actif = voulu && onglets.includes(voulu) ? voulu : onglets[0];
  const references = presentation?.references;
  const titre = (id: ResourceTab) => {
    const propre =
      references?.[id === 'capacites' || id === 'marche' || id === 'bestiaire' ? id : 'images']
        ?.titre;
    return propre ?? t(`resources.tabs.${id}`);
  };

  if (!actif)
    return (
      <Notice icon={Library} title={t('resources.none')} description={t('resources.noneHint')} />
    );

  const changer = (v: string) => {
    const id = v as ResourceTab;
    if (onTabChange) onTabChange(id);
    else setLocal(id);
  };

  return (
    <ResourcesVariantProvider value={variant}>
      <div className="mx-auto w-full max-w-7xl">
        {onglets.length > 1 && (
          <PillGroup>
            <div
              role="tablist"
              aria-label={t('resources.title')}
              className="mb-6 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-surface-2/50 p-1 [scrollbar-width:none] sm:w-fit"
            >
              {onglets.map((id) => {
                const Icone = ONGLETS.find((o) => o.id === id)!.icon;
                const on = id === actif;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => changer(id)}
                    className={cn(
                      'relative isolate flex h-9 shrink-0 items-center gap-2 rounded-xl px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {on && <ActivePill className="bg-card shadow-surface ring-1 ring-border" />}
                    <Icone className={cn('size-4', on && 'text-primary')} aria-hidden />
                    {titre(id)}
                  </button>
                );
              })}
            </div>
          </PillGroup>
        )}
        {onglets
          .filter((id) => id === actif)
          .map((id) => (
            <div key={id} role="tabpanel">
              {id === 'capacites' && <CatalogueTab systeme={systeme} presentation={presentation} />}
              {id === 'marche' && (
                <MarketTab
                  systeme={systeme}
                  presentation={presentation}
                  target={access.inventory}
                />
              )}
              {id === 'bestiaire' && (
                <BestiaryTab
                  systemId={systemId}
                  systeme={systeme}
                  presentation={presentation}
                  campaignId={access.campaignBestiary}
                  reference={access.systemBestiary}
                />
              )}
              {id === 'images' && <ImagesTab presentation={presentation} />}
            </div>
          ))}
      </div>
    </ResourcesVariantProvider>
  );
}
