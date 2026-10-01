'use client';

import { ArrowRight, ChevronLeft, ChevronRight, Globe, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { AvatarJoueur, Message } from '@/components/compte/elements';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputGroup } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreur } from '@/lib/api';
import {
  useCampagnesPubliques,
  useRejoindreSansCode,
  type Campagne,
  type DetailCampagne,
} from '@/lib/campagnes';
import { cn } from '@/lib/utils';
import { useNomSysteme } from './carte-campagne';

/** Délai avant de chercher, pour ne pas interroger le service à chaque lettre. */
const DELAI_RECHERCHE_MS = 300;

/**
 * « Campagnes ouvertes » : les campagnes publiques de tous les joueurs, avec
 * recherche (nom, description ou code) et pages. Rejoindre ne demande pas de
 * code ; on arrive ensuite au choix du héros, comme avec un code, sauf si
 * `onRejointe` décide d'une autre suite (onboarding).
 */
export function CampagnesOuvertes({
  onRejointe,
  compacte = false,
  className,
}: {
  onRejointe?: (c: DetailCampagne) => void | Promise<void>;
  /** Deux colonnes et cartes basses (dialogue, onboarding). */
  compacte?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [saisie, setSaisie] = useState('');
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const publiques = useCampagnesPubliques(recherche, page);
  const rejoindre = useRejoindreSansCode();
  const [enCours, setEnCours] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setRecherche(saisie);
      setPage(1);
    }, DELAI_RECHERCHE_MS);
    return () => window.clearTimeout(t);
  }, [saisie]);

  async function entrer(c: Campagne) {
    setEnCours(c.id);
    try {
      const rejointe = await rejoindre.mutateAsync(c.id);
      toast.success(`Bienvenue dans « ${rejointe.name} »`);
      if (onRejointe) await onRejointe(rejointe);
      else router.push(`/campagnes/${rejointe.id}/personnage`);
    } catch (err) {
      toast.error(messageErreur(err));
    } finally {
      setEnCours(null);
    }
  }

  const donnees = publiques.data;
  const pages = donnees ? Math.max(1, Math.ceil(donnees.total / donnees.parPage)) : 1;

  return (
    <div className={cn('space-y-4', className)}>
      <InputGroup
        avant={<Search />}
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        placeholder="Rechercher par nom, thème ou code…"
        className="h-10"
        aria-label="Rechercher une campagne ouverte"
      />

      {publiques.isError && <Message>{messageErreur(publiques.error)}</Message>}

      <div
        className={cn(
          'grid gap-3',
          compacte ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3',
          publiques.isPlaceholderData && 'opacity-60 transition-opacity',
        )}
        aria-busy={publiques.isFetching}
      >
        {publiques.isLoading &&
          Array.from({ length: compacte ? 2 : 3 }, (_, i) => (
            <Skeleton key={i} className={cn('rounded-2xl', compacte ? 'h-40' : 'h-60')} />
          ))}
        {donnees?.campagnes.map((c) => (
          <CarteOuverte
            key={c.id}
            campagne={c}
            compacte={compacte}
            enCours={enCours === c.id}
            bloque={enCours !== null}
            onRejoindre={() => void entrer(c)}
          />
        ))}
      </div>

      {donnees && donnees.total === 0 && (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-subtle">
          {recherche.trim()
            ? 'Aucune campagne ouverte ne correspond à cette recherche.'
            : 'Aucune campagne ouverte pour le moment. Créez la vôtre et rendez-la publique !'}
        </p>
      )}

      {donnees && pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span>
            {donnees.total} campagne{donnees.total > 1 ? 's' : ''} · page {donnees.page} sur {pages}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1 || publiques.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Page précédente"
            >
              <ChevronLeft />
              Précédente
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= pages || publiques.isFetching}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              aria-label="Page suivante"
            >
              Suivante
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Carte d'une campagne ouverte : couverture, nom, système, MJ, joueurs, et Rejoindre. */
function CarteOuverte({
  campagne: c,
  compacte,
  enCours,
  bloque,
  onRejoindre,
}: {
  campagne: Campagne;
  compacte: boolean;
  enCours: boolean;
  bloque: boolean;
  onRejoindre: () => void;
}) {
  const nomSysteme = useNomSysteme(c.system);
  const membre = c.role !== null;
  return (
    <article
      data-ambiance={c.ambiance}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-surface transition-colors hover:border-primary/40"
    >
      <Illustration
        largeur={640}
        src={c.coverUrl}
        graine={c.name || 'Campagne'}
        className={cn('w-full', compacte ? 'aspect-[16/6]' : 'aspect-[16/8]')}
        classeImage="transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        voile
      >
        <div className="absolute left-3 top-3">
          <Badge ton="verre">
            <Globe />
            Ouverte
          </Badge>
        </div>
        {nomSysteme && (
          <div className="absolute right-3 top-3">
            <Badge ton="verre">{nomSysteme}</Badge>
          </div>
        )}
        <div className="absolute inset-x-4 bottom-3">
          <h3 className="truncate text-[17px] font-semibold tracking-tight text-white drop-shadow">
            {c.name}
          </h3>
          {c.pitch && !compacte && (
            <p className="mt-0.5 line-clamp-1 text-[13px] text-white/70">{c.pitch}</p>
          )}
        </div>
      </Illustration>
      <div className="flex flex-1 items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AvatarJoueur nom={c.owner.name} url={c.owner.avatarUrl} taille="xs" />
          <div className="min-w-0 text-xs">
            <p className="truncate text-foreground/90">
              <span className="text-subtle">MJ </span>
              {c.owner.name}
            </p>
            <p className="flex items-center gap-1 text-subtle">
              <Users className="size-3" />
              {c.playerCount} joueur{c.playerCount > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {membre ? (
          <Button size="sm" variant="secondary" asChild>
            <Link href={`/campagnes/${c.id}`}>
              Ouvrir
              <ArrowRight />
            </Link>
          </Button>
        ) : (
          <Button size="sm" onClick={onRejoindre} loading={enCours} disabled={bloque && !enCours}>
            Rejoindre
          </Button>
        )}
      </div>
    </article>
  );
}
