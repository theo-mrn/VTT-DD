'use client';

import { KeyRound, Plus, Search, Swords } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { CarteCampagne, CarteCampagneSquelette } from '@/components/campagnes/carte-campagne';
import { DialogueRejoindre } from '@/components/campagnes/dialogue-rejoindre';
import { CampagnesOuvertes } from '@/components/campagnes/public-campaigns';
import { InvitationsRecues } from '@/components/campagnes/received-invitations';
import { Message } from '@/components/compte/elements';
import { EnTetePage, EtatVide, Page, TitreSection } from '@/components/commun/page';
import { Button } from '@/components/ui/button';
import { InputGroup } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import { useProfil } from '@/lib/session';

type Filtre = 'toutes' | 'gm' | 'player';

function ListeCampagnes() {
  const t = useTranslations('campaigns.list');
  const profil = useProfil();
  const router = useRouter();
  const params = useSearchParams();
  const campagnes = useCampagnes();
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [recherche, setRecherche] = useState('');
  const rejoindre = params.get('rejoindre') === '1';

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return (campagnes.data ?? []).filter(
      (c) =>
        (filtre === 'toutes' || c.role === filtre) &&
        (!q || `${c.name} ${c.pitch} ${c.tags.join(' ')}`.toLowerCase().includes(q)),
    );
  }, [campagnes.data, filtre, recherche]);

  const nombre = (f: Filtre) =>
    (campagnes.data ?? []).filter((c) => f === 'toutes' || c.role === f).length;
  let etat: 'chargement' | 'aucune' | 'filtree' | 'liste' = 'liste';
  if (campagnes.isLoading) etat = 'chargement';
  else if (campagnes.data?.length === 0) etat = 'aucune';
  else if (liste.length === 0) etat = 'filtree';

  function ouvrirRejoindre(v: boolean) {
    router.replace(v ? '/campagnes?rejoindre=1' : '/campagnes', { scroll: false });
  }

  return (
    <Page large>
      <EnTetePage
        surtitre={t('eyebrow')}
        titre={t('title')}
        description={t('lead')}
        actions={
          <>
            <Button variant="secondary" onClick={() => ouvrirRejoindre(true)}>
              <KeyRound />
              {t('joinWithCode')}
            </Button>
            <Button asChild>
              <Link href="/campagnes/nouvelle">
                <Plus />
                {t('newCampaign')}
              </Link>
            </Button>
          </>
        }
      />

      {(campagnes.data?.length ?? 0) > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={filtre} onValueChange={(v) => setFiltre(v as Filtre)}>
            <TabsList>
              <TabsTrigger value="toutes">{t('all', { count: nombre('toutes') })}</TabsTrigger>
              <TabsTrigger value="gm">{t('gm', { count: nombre('gm') })}</TabsTrigger>
              <TabsTrigger value="player">{t('player', { count: nombre('player') })}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="sm:w-72">
            <InputGroup
              avant={<Search />}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder={t('search')}
              className="h-9"
              aria-label={t('searchLabel')}
            />
          </div>
        </div>
      )}

      <InvitationsRecues className="mb-8" />

      {campagnes.isError && <Message>{messageErreur(campagnes.error)}</Message>}

      {etat === 'chargement' && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <CarteCampagneSquelette key={i} />
          ))}
        </div>
      )}
      {etat === 'aucune' && (
        <EtatVide
          icone={Swords}
          titre={t('emptyTitle')}
          description={t('emptyText')}
          action={
            <>
              <Button asChild>
                <Link href="/campagnes/nouvelle">
                  <Plus />
                  {t('create')}
                </Link>
              </Button>
              <Button variant="secondary" onClick={() => ouvrirRejoindre(true)}>
                <KeyRound />
                {t('joinWithCode')}
              </Button>
            </>
          }
        />
      )}
      {etat === 'filtree' && (
        <p className="py-16 text-center text-sm text-subtle">{t('noMatch')}</p>
      )}
      {etat === 'liste' && (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {liste.map((c, i) => (
            <div key={c.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
              <CarteCampagne campagne={c} userId={profil.id} />
            </div>
          ))}
        </div>
      )}

      <section className="mt-12">
        <TitreSection>{t('openTitle')}</TitreSection>
        <p className="-mt-2 mb-5 text-[13px] text-muted-foreground">{t('openLead')}</p>
        <CampagnesOuvertes />
      </section>

      <DialogueRejoindre
        ouvert={rejoindre}
        onOuvert={ouvrirRejoindre}
        codeInitial={params.get('code') ?? ''}
      />
    </Page>
  );
}

export default function PageCampagnes() {
  return (
    <Suspense>
      <ListeCampagnes />
    </Suspense>
  );
}
