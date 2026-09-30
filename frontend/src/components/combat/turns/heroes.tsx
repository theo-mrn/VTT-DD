'use client';

/**
 * Onglet « Héros » du panneau Combat : l'ancien panneau MJ repris tel quel (docs/combat.md
 * § 2.6) : les héros de la table d'un coup d'œil (personnages engagés, création terminée),
 * portrait, nom, résumé, joueur qui l'incarne, lien vers la fiche et bloc Ressources de la
 * fiche, modifiable (écrit par le service character, qui accepte le MJ de la campagne).
 */
import { Crown, ExternalLink, Users } from 'lucide-react';
import { EtatVide, TitreSection } from '@/components/commun/page';
import { Illustration } from '@/components/commun/illustration';
import { useFicheCalculee } from '@/components/fiche/fiche-personnage';
import { BlocRessources, widgetsDe } from '@/components/fiche/widgets';
import { FrontiereTable } from '@/components/table/frontiere';
import { PanelLink } from '@/components/table/panels/navigation';
import { TABLE_PARAMS } from '@/components/table/panels/registry';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreur } from '@/lib/api';
import type { DetailCampagne } from '@/lib/campagnes';
import { usePersonnagesCampagne, type Personnage } from '@/lib/personnages';

/** Grille qui suit la largeur du panneau (et non celle de l'écran). */
const GRILLE = 'grid items-start gap-4 grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]';

export function HeroesTab({ campagne }: { campagne: DetailCampagne }) {
  const personnages = usePersonnagesCampagne(campagne.id);
  const incarnePar = new Map(
    campagne.members.filter((m) => m.characterId).map((m) => [m.characterId!, m.name]),
  );
  const liste = (personnages.data ?? []).filter((p) => !p.inCreation);

  return (
    <div>
      <TitreSection compte={personnages.data ? liste.length : undefined}>
        <Crown className="size-4 text-primary" aria-hidden />
        Les héros de la table
      </TitreSection>
      {personnages.isLoading ? (
        <div className={GRILLE}>
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
        <div className={GRILLE}>
          {liste.map((p) => (
            <FrontiereTable key={p.id} nom={p.name}>
              <CarteHerosMj personnage={p} joueur={incarnePar.get(p.id) ?? null} />
            </FrontiereTable>
          ))}
        </div>
      )}
    </div>
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
