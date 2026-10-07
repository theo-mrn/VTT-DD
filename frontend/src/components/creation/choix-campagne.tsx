'use client';

import { useTranslations } from 'next-intl';
import { ArrowRight, KeyRound, Swords } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { DialogueRejoindre } from '@/components/campagnes/dialogue-rejoindre';
import { BadgeRole } from '@/components/campagnes/elements';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { EtatVide } from '@/components/commun/page';
import { EnTeteFocus } from '@/components/shell/cadre-focus';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { type Campagne, useCampagnes } from '@/lib/campagnes';

/**
 * Premier écran de la création d'un personnage : un héros appartient toujours à
 * une campagne, qui impose son système de jeu. Sans campagne, on en choisit une,
 * on en rejoint une par code, ou on en crée une.
 */
export function ChoixCampagnePersonnage() {
  const t = useTranslations();
  const campagnes = useCampagnes();
  const [rejoindre, setRejoindre] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col">
      <EnTeteFocus quitter={{ href: '/personnages' }} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 lg:py-14">
        <div className="mb-8 space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
            {t('characters.page.newHero')}
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight">
            {t('creation.pick.title')}
          </h1>
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {t('creation.pick.lead')}
          </p>
        </div>

        {campagnes.isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-[16/11] rounded-2xl" />
            ))}
          </div>
        )}

        {campagnes.data && campagnes.data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campagnes.data.map((c) => (
              <CarteChoix key={c.id} campagne={c} />
            ))}
          </div>
        )}

        {campagnes.data?.length === 0 && (
          <EtatVide
            icone={Swords}
            titre={t('creation.pick.none')}
            description={t('creation.pick.noneHint')}
          />
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setRejoindre(true)}>
            <KeyRound />
            {t('onboarding.joinCampaign')}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/campagnes/nouvelle">
              <Swords />
              {t('onboarding.createCampaign')}
            </Link>
          </Button>
        </div>
      </main>
      <DialogueRejoindre ouvert={rejoindre} onOuvert={setRejoindre} />
    </div>
  );
}

function CarteChoix({ campagne }: Readonly<{ campagne: Campagne }>) {
  const t = useTranslations();
  const nomSysteme = useNomSysteme(campagne.system);
  return (
    <Link
      href={`/personnages/nouveau?${new URLSearchParams({ campagne: campagne.id })}`}
      data-ambiance={campagne.ambiance}
      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-surface transition-all hover:-translate-y-0.5 hover:border-primary/50"
    >
      <Illustration
        largeur={640}
        src={campagne.coverUrl}
        graine={campagne.name || t('notes.props.campaign')}
        className="aspect-[16/8] w-full"
        classeImage="transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        voile
      >
        <div className="absolute left-3 top-3">
          <BadgeRole role={campagne.role} />
        </div>
      </Illustration>
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold">{campagne.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{nomSysteme}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
    </Link>
  );
}
