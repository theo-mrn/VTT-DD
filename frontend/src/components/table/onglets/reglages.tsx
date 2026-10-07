'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ReglagesForm } from '@/components/campagnes/reglages-campagne';
import { OngletsReglages, StockageCampagne } from '@/components/campagnes/stockage-campagne';
import { EtatVide, Page } from '@/components/commun/page';
import { useTable } from '../contexte';

/**
 * Réglages de la campagne, dans la table (MJ) : les mêmes que dans le salon — identité,
 * apparence, accès, règles optionnelles (encombrement…), lanceur de dés — sans quitter la
 * partie. La barre d'enregistrement reste en bas du panneau. Onglet « Stockage » : place
 * occupée et fichiers envoyés (docs/stockage.md).
 */
export function OngletReglages() {
  const t = useTranslations('table.settings');
  const { campagne, gm } = useTable();
  const [vue, setVue] = useState<'campagne' | 'stockage'>('campagne');
  if (!gm)
    return (
      <Page>
        <EtatVide icone={Lock} titre={t('gmOnly')} description={t('gmOnlyText')} />
      </Page>
    );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <div className="px-6 pt-5">
        <OngletsReglages vue={vue} onVue={setVue} />
      </div>
      {vue === 'campagne' ? (
        <>
          <p className="px-6 pt-4 text-[13px] text-muted-foreground">{t('lead')}</p>
          <ReglagesForm campagne={campagne} actif pied="sticky bottom-0 z-10 bg-background/95" />
        </>
      ) : (
        <StockageCampagne campaignId={campagne.id} />
      )}
    </div>
  );
}
