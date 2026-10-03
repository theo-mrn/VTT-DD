'use client';

import { KeyRound, Plus, Search, Swords } from 'lucide-react';
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
  const profil = useProfil();
  const router = useRouter();
  const params = useSearchParams();
  const campagnes = useCampagnes();
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [recherche, setRecherche] = useState('');
  const rejoindre = params.get('rejoindre') === '1';

  const liste = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return (campagnes.data ?? []).filter(
      (c) =>
        (filtre === 'toutes' || c.role === filtre) &&
        (!t || `${c.name} ${c.pitch} ${c.tags.join(' ')}`.toLowerCase().includes(t)),
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
        surtitre="Vos tables"
        titre="Campagnes"
        description="Les aventures que vous menez et celles où vous jouez."
        actions={
          <>
            <Button variant="secondary" onClick={() => ouvrirRejoindre(true)}>
              <KeyRound />
              Rejoindre avec un code
            </Button>
            <Button asChild>
              <Link href="/campagnes/nouvelle">
                <Plus />
                Nouvelle campagne
              </Link>
            </Button>
          </>
        }
      />

      {(campagnes.data?.length ?? 0) > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={filtre} onValueChange={(v) => setFiltre(v as Filtre)}>
            <TabsList>
              <TabsTrigger value="toutes">Toutes · {nombre('toutes')}</TabsTrigger>
              <TabsTrigger value="gm">Je suis MJ · {nombre('gm')}</TabsTrigger>
              <TabsTrigger value="player">Je joue · {nombre('player')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="sm:w-72">
            <InputGroup
              avant={<Search />}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une campagne…"
              className="h-9"
              aria-label="Rechercher une campagne"
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
          titre="Aucune campagne pour l'instant"
          description="Créez votre propre aventure en tant que maître du jeu, ou rejoignez celle d'un ami avec son code."
          action={
            <>
              <Button asChild>
                <Link href="/campagnes/nouvelle">
                  <Plus />
                  Créer une campagne
                </Link>
              </Button>
              <Button variant="secondary" onClick={() => ouvrirRejoindre(true)}>
                <KeyRound />
                Rejoindre avec un code
              </Button>
            </>
          }
        />
      )}
      {etat === 'filtree' && (
        <p className="py-16 text-center text-sm text-subtle">Aucune campagne ne correspond.</p>
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
        <TitreSection>Campagnes ouvertes</TitreSection>
        <p className="-mt-2 mb-5 text-[13px] text-muted-foreground">
          Des tables publiques qui accueillent de nouveaux joueurs, sans code.
        </p>
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
