'use client';

import { Crown, Eye, Users } from 'lucide-react';
import Link from 'next/link';
import { EtatVide, Page } from '@/components/commun/page';
import { FichePersonnage } from '@/components/fiche/fiche-personnage';
import { Button } from '@/components/ui/button';
import { useTable } from '../contexte';
import { PanelLink } from '../panels/navigation';

/** Ma fiche : celle du héros incarné, éditable et tenue à jour en direct. */
export function OngletFiche() {
  const { herosId, gm, campagne } = useTable();
  if (herosId) return <FichePersonnage id={herosId} />;
  return (
    <Page>
      <EtatVide
        icone={gm ? Crown : Eye}
        titre={gm ? 'Vous menez la partie' : 'Vous regardez la partie'}
        description={
          gm
            ? 'En maître du jeu, vous n’incarnez pas de héros. Les fiches des joueurs sont dans « Joueurs » et « MJ ».'
            : 'Les spectateurs n’incarnent pas de héros.'
        }
        action={
          <>
            <Button asChild>
              <PanelLink panel={gm ? 'mj' : 'joueurs'}>
                {gm ? <Crown /> : <Users />}
                {gm ? 'Vue MJ' : 'Voir les joueurs'}
              </PanelLink>
            </Button>
            {gm && (
              <Button variant="secondary" asChild>
                <Link href={`/campagnes/${campagne.id}/personnage`}>Jouer un héros</Link>
              </Button>
            )}
          </>
        }
      />
    </Page>
  );
}
