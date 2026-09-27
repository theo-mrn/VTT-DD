'use client';

import { Crown, ExternalLink, Lock, Users } from 'lucide-react';
import { EtatVide, Page, TitreSection } from '@/components/commun/page';
import { Illustration } from '@/components/commun/illustration';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { BlocRessources, widgetsDe } from '@/components/fiche/widgets';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreur } from '@/lib/api';
import { usePersonnagesCampagne, type Personnage } from '@/lib/personnages';
import { useTable } from '../contexte';
import { FrontiereTable } from '../frontiere';
import { PanelLink } from '../panels/navigation';
import { TABLE_PARAMS } from '../panels/registry';

/**
 * Vue du MJ : les héros de la table d'un coup d'œil, ressources modifiables
 * (écrites par le service character, qui accepte le MJ de la campagne).
 */
export function OngletMj() {
  const { campagne, gm } = useTable();
  const personnages = usePersonnagesCampagne(gm ? campagne.id : null);

  if (!gm)
    return (
      <Page>
        <EtatVide
          icone={Lock}
          titre="Réservé au maître du jeu"
          description="Cette vue rassemble les héros de la table pour le MJ."
        />
      </Page>
    );

  const incarnePar = new Map(
    campagne.members.filter((m) => m.characterId).map((m) => [m.characterId!, m.name]),
  );
  const liste = (personnages.data ?? []).filter((p) => !p.inCreation);

  return (
    <Page large>
      <TitreSection compte={personnages.data ? liste.length : undefined}>
        <Crown className="size-4 text-primary" aria-hidden />
        Les héros de la table
      </TitreSection>
      {personnages.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : personnages.isError ? (
        <EtatVide
          icone={Users}
          titre="Personnages indisponibles"
          description={messageErreur(personnages.error)}
        />
      ) : liste.length === 0 ? (
        <EtatVide
          icone={Users}
          titre="Aucun héros à la table"
          description="Les héros des joueurs apparaîtront ici dès qu’ils les auront choisis."
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {liste.map((p) => (
            <FrontiereTable key={p.id} nom={p.name}>
              <CarteHerosMj personnage={p} joueur={incarnePar.get(p.id) ?? null} />
            </FrontiereTable>
          ))}
        </div>
      )}
    </Page>
  );
}

function CarteHerosMj({
  personnage: p,
  joueur,
}: {
  personnage: Personnage;
  joueur: string | null;
}) {
  const { ctx, perso } = useFicheCalculee(p.id);
  const ressources = ctx ? widgetsDe(ctx).find((w) => w.type === 'ressources') : undefined;

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-surface">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <Illustration
          src={p.portraitUrl}
          graine={p.name}
          position="top"
          className="size-12 shrink-0 rounded-xl ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[p.summary.tagline, joueur ? `joué par ${joueur}` : 'non incarné']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" asChild>
          <PanelLink
            panel="joueurs"
            params={{ [TABLE_PARAMS.character]: p.id }}
            aria-label={`Ouvrir la fiche de ${p.name}`}
          >
            <ExternalLink />
          </PanelLink>
        </Button>
      </header>
      {perso.isError ? (
        <p className="p-4 text-sm text-destructive">{messageErreur(perso.error)}</p>
      ) : !ctx ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : ressources?.type === 'ressources' && ressources.attributs.length ? (
        // Le bloc de la fiche, sans son cadre : la carte en tient lieu
        <div className="[&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none">
          <BlocRessources ctx={ctx} widget={ressources} />
        </div>
      ) : (
        <p className="p-4 text-sm text-subtle">Aucune ressource suivie par ce système.</p>
      )}
    </article>
  );
}
