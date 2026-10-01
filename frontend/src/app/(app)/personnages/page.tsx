'use client';

import { Plus, Search, Swords, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EnTetePage, EtatVide, Page } from '@/components/commun/page';
import { TrashButton } from '@/components/commun/trash-button';
import { Message } from '@/components/compte/elements';
import {
  CartePersonnage,
  CartePersonnageSquelette,
} from '@/components/personnages/carte-personnage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup } from '@/components/ui/input';
import { useCampagnes } from '@/lib/campagnes';
import { lienPersonnage, usePersonnages } from '@/lib/personnages';
import { useSystemes } from '@/lib/systemes';
import { useCharacterTrash } from '@/lib/trash';
import { cn } from '@/lib/utils';

/** Galerie des personnages du joueur, filtrable par système et par campagne. */
export default function PagePersonnages() {
  const personnages = usePersonnages();
  const campagnes = useCampagnes();
  const systemes = useSystemes();
  const corbeille = useCharacterTrash();
  const [systeme, setSysteme] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  const nomSysteme = (id: string) => systemes.data?.find((s) => s.id === id)?.nom ?? id;
  const nomCampagne = (id: string | null) => campagnes.data?.find((c) => c.id === id)?.name ?? null;
  const utilises = [...new Set((personnages.data ?? []).map((p) => p.system.id))];

  const liste = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return (personnages.data ?? []).filter(
      (p) =>
        (!systeme || p.system.id === systeme) &&
        (!t || `${p.name} ${p.summary.tagline} ${p.concept}`.toLowerCase().includes(t)),
    );
  }, [personnages.data, systeme, recherche]);

  return (
    <Page large>
      <EnTetePage
        surtitre="Vos héros"
        titre="Personnages"
        description="Chaque fiche est calculée par les règles de son système : valeurs, bonus et jets sont toujours justes."
        actions={
          <div className="flex items-center gap-1.5">
            <TrashButton items={corbeille.data} />
            <Button asChild>
              <Link href="/personnages/nouveau">
                <Plus />
                Nouveau personnage
              </Link>
            </Button>
          </div>
        }
      />

      {(personnages.data?.length ?? 0) > 0 && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {[null, ...utilises].map((id) => (
              <button
                key={id ?? 'tous'}
                type="button"
                aria-pressed={systeme === id}
                onClick={() => setSysteme(id)}
                className={cn(
                  'h-8 rounded-full border px-3.5 text-[13px] transition-colors',
                  systeme === id
                    ? 'border-primary/50 bg-primary/15 text-primary-strong'
                    : 'border-border-strong text-muted-foreground hover:text-foreground',
                )}
              >
                {id ? nomSysteme(id) : `Tous · ${personnages.data?.length}`}
              </button>
            ))}
          </div>
          <div className="sm:w-72">
            <InputGroup
              avant={<Search />}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un héros…"
              className="h-9"
              aria-label="Rechercher un personnage"
            />
          </div>
        </div>
      )}

      {personnages.isError && <Message>{personnages.error?.message}</Message>}

      {personnages.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <CartePersonnageSquelette key={i} />
          ))}
        </div>
      ) : personnages.data?.length === 0 ? (
        <EtatVide
          icone={UserRound}
          titre="Aucun personnage"
          description="Créez votre premier héros : l'assistant vous guide étape par étape, selon les règles du système choisi."
          action={
            <Button asChild>
              <Link href="/personnages/nouveau">
                <Plus />
                Créer un personnage
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {liste.map((p, i) => {
            const campagne = nomCampagne(p.roomId);
            return (
              <div key={p.id} className="animate-fade-up" style={{ animationDelay: `${i * 30}ms` }}>
                <CartePersonnage
                  personnage={p}
                  href={lienPersonnage(p)}
                  haut={
                    <>
                      <Badge ton="verre">{nomSysteme(p.system.id)}</Badge>
                      {p.inCreation && <Badge ton="verre">En création</Badge>}
                    </>
                  }
                  bas={
                    campagne && (
                      <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-primary-strong">
                        <Swords className="size-3 shrink-0" />
                        {campagne}
                      </p>
                    )
                  }
                />
              </div>
            );
          })}
          <Link
            href="/personnages/nouveau"
            className="group flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/[0.04] hover:text-foreground"
          >
            <span className="flex size-11 items-center justify-center rounded-full border border-border-strong bg-surface-2 transition-colors group-hover:border-primary/40 group-hover:text-primary">
              <Plus className="size-5" />
            </span>
            <span className="text-sm font-medium">Nouveau héros</span>
          </Link>
        </div>
      )}
      {liste.length === 0 && (personnages.data?.length ?? 0) > 0 && (
        <p className="py-10 text-center text-sm text-subtle">Aucun personnage ne correspond.</p>
      )}
    </Page>
  );
}
