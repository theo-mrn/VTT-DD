'use client';

import { ChevronDown, FilePlus2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { MODELES_NOTE, type ModeleNote } from './modeles';

/** Bouton scindé : note vierge d'un clic, ou partir d'un modèle via le chevron. */
export function BoutonNouvelleNote({
  onNouvelle,
  enCours,
  compact = false,
  className,
}: {
  onNouvelle: (modele?: ModeleNote) => void;
  enCours: boolean;
  /** Icône seule (volet étroit). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex shrink-0 items-center', className)}>
      <Info
        texte={
          <span className="flex items-center gap-2">
            Nouvelle note <Kbd>N</Kbd>
          </span>
        }
        cote="bottom"
      >
        <Button
          size={compact ? 'icon-sm' : 'sm'}
          loading={enCours}
          onClick={() => onNouvelle()}
          className="rounded-r-none"
          aria-label="Nouvelle note"
        >
          {!enCours && <Plus />}
          {!compact && 'Nouvelle note'}
        </Button>
      </Info>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            className="w-7 rounded-l-none border-l border-primary-foreground/15"
            aria-label="Partir d'un modèle"
            disabled={enCours}
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => onNouvelle()}>
            <span className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface-2">
              <FilePlus2 className="size-4 text-primary" />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-foreground">Page vierge</span>
              <span className="text-xs text-subtle">Partir de zéro</span>
            </span>
            <DropdownMenuShortcut>N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Modèles</DropdownMenuLabel>
          {MODELES_NOTE.map((m) => (
            <DropdownMenuItem key={m.id} onSelect={() => onNouvelle(m)}>
              <span className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface-2 text-base leading-none">
                {m.icone}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-foreground">{m.label}</span>
                <span className="truncate text-xs text-subtle">{m.description}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
