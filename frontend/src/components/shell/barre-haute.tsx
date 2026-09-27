'use client';

import { Bell, ChevronRight, Dices, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useState } from 'react';
import { LanceurRapide } from '@/components/des/lanceur-rapide';
import { AvatarJoueur } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { useDemandesAmis } from '@/lib/amis';
import { useCampagne } from '@/lib/campagnes';
import { usePersonnage } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { LIBELLES_SEGMENTS } from './navigation';

/** Barre du haut : menu mobile, fil d'Ariane, lanceur de dés, demandes, recherche. */
export function BarreHaute({
  onMenu,
  onRecherche,
}: {
  onMenu: () => void;
  onRecherche: () => void;
}) {
  const [des, setDes] = useState(false);
  const demandes = useDemandesAmis();
  const recues = demandes.data?.received ?? [];

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/75 px-3 backdrop-blur-xl sm:px-5">
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Ouvrir le menu"
      >
        <Menu />
      </Button>

      <FilAriane />

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onRecherche}
          className="hidden h-8 items-center gap-2 rounded-lg border border-border bg-surface/80 pl-2.5 pr-1.5 text-[13px] text-subtle transition-colors hover:border-border-strong hover:text-muted-foreground md:flex lg:hidden"
        >
          <Search className="size-3.5" />
          Rechercher
          <Kbd>⌘K</Kbd>
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          onClick={onRecherche}
          aria-label="Rechercher"
        >
          <Search />
        </Button>

        <Popover open={des} onOpenChange={setDes}>
          <Info texte="Lancer des dés">
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Lancer des dés">
                <Dices className={cn(des && 'text-primary')} />
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent align="end" className="w-[340px]">
            <LanceurRapide onFerme={() => setDes(false)} />
          </PopoverContent>
        </Popover>

        <Popover>
          <Info texte="Notifications">
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Notifications"
                className="relative"
              >
                <Bell />
                {recues.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
                )}
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-medium">Notifications</p>
            </div>
            {recues.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-subtle">
                Rien de neuf pour le moment.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto p-1.5">
                {recues.map((d) => (
                  <li key={d.id}>
                    <Link
                      href="/amis"
                      className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-surface-3"
                    >
                      <AvatarJoueur nom={d.name} url={d.avatarUrl} taille="sm" />
                      <span className="min-w-0 text-[13px] text-muted-foreground">
                        <span className="font-medium text-foreground">{d.name}</span> vous a envoyé
                        une demande d&apos;ami.
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}

function FilAriane() {
  const chemin = usePathname();
  const segments = chemin.split('/').filter(Boolean);
  const idCampagne =
    segments[0] === 'campagnes' && segments[1] && segments[1] !== 'nouvelle' ? segments[1] : null;
  const idPersonnage =
    segments[0] === 'personnages' && segments[1] && segments[1] !== 'nouveau' ? segments[1] : null;
  const campagne = useCampagne(idCampagne);
  const personnage = usePersonnage(idPersonnage);

  const libelle = (s: string, i: number) => {
    if (i === 1 && idCampagne) return campagne.data?.name ?? '…';
    if (i === 1 && idPersonnage) return personnage.data?.name ?? '…';
    if (segments[0] === 'joueurs' && i === 1) return 'Joueur';
    return LIBELLES_SEGMENTS[s] ?? s;
  };

  return (
    <nav aria-label="Fil d'Ariane" className="flex min-w-0 items-center gap-1 text-[13px]">
      {segments.map((s, i) => {
        const href = `/${segments.slice(0, i + 1).join('/')}`;
        const dernier = i === segments.length - 1;
        return (
          <Fragment key={href}>
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle/60" />}
            {dernier ? (
              <span className="truncate font-medium text-foreground" aria-current="page">
                {libelle(s, i)}
              </span>
            ) : (
              <Link
                href={href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {libelle(s, i)}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
