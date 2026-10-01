'use client';

import { Lock } from 'lucide-react';
import { ReglagesForm } from '@/components/campagnes/reglages-campagne';
import { EtatVide, Page } from '@/components/commun/page';
import { useTable } from '../contexte';

/**
 * Réglages de la campagne, dans la table (MJ) : les mêmes que dans le salon — identité,
 * apparence, accès, règles optionnelles (encombrement…), lanceur de dés — sans quitter la
 * partie. La barre d'enregistrement reste en bas du panneau.
 */
export function OngletReglages() {
  const { campagne, gm } = useTable();
  if (!gm)
    return (
      <Page>
        <EtatVide
          icone={Lock}
          titre="Réservé au maître du jeu"
          description="Les réglages de la campagne se changent par le MJ."
        />
      </Page>
    );
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <p className="px-6 pt-5 text-[13px] text-muted-foreground">
        Visibles par toute la table. Le système de jeu ne change pas.
      </p>
      <ReglagesForm campagne={campagne} actif pied="sticky bottom-0 z-10 bg-background/95" />
    </div>
  );
}
