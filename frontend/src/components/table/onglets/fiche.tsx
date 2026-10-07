'use client';

import { Crown, Eye, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { EtatVide, Page } from '@/components/commun/page';
import { FichePersonnage } from '@/components/fiche/fiche-personnage';
import { Button } from '@/components/ui/button';
import { useTable } from '../contexte';
import { PanelLink } from '../panels/navigation';

/** Ma fiche : celle du héros incarné, éditable et tenue à jour en direct. */
export function OngletFiche() {
  const t = useTranslations('table.sheet');
  const { herosId, gm, campagne } = useTable();
  if (herosId) return <FichePersonnage id={herosId} dansPanneau />;
  return (
    <Page>
      <EtatVide
        icone={gm ? Crown : Eye}
        titre={gm ? t('gmTitle') : t('spectatorTitle')}
        description={gm ? t('gmText') : t('spectatorText')}
        action={
          <>
            <Button asChild>
              <PanelLink panel="joueurs">
                <Users />
                {gm ? t('characters') : t('seePlayers')}
              </PanelLink>
            </Button>
            {gm && (
              <Button variant="secondary" asChild>
                <Link href={`/campagnes/${campagne.id}/personnage`}>{t('playHero')}</Link>
              </Button>
            )}
          </>
        }
      />
    </Page>
  );
}
