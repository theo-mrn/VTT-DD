'use client';

import { useTranslations } from 'next-intl';
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
}: Readonly<{
  onNouvelle: (modele?: ModeleNote) => void;
  enCours: boolean;
  /** Icône seule (volet étroit). */
  compact?: boolean;
  className?: string;
}>) {
  const t = useTranslations();
  return (
    <div className={cn('inline-flex shrink-0 items-center', className)}>
      <Info
        texte={
          <span className="flex items-center gap-2">
            {t('notes.new')} <Kbd>N</Kbd>
          </span>
        }
        cote="bottom"
      >
        <Button
          size={compact ? 'icon-sm' : 'sm'}
          loading={enCours}
          onClick={() => onNouvelle()}
          className="rounded-r-none"
          aria-label={t('notes.new')}
        >
          {!enCours && <Plus />}
          {!compact && t('notes.new')}
        </Button>
      </Info>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            className="w-7 rounded-l-none border-l border-primary-foreground/15"
            aria-label={t('notes.fromTemplate')}
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
              <span className="text-foreground">{t('notes.blank')}</span>
              <span className="text-xs text-subtle">{t('notes.fromScratch')}</span>
            </span>
            <DropdownMenuShortcut>N</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('notes.templatesTitle')}</DropdownMenuLabel>
          {MODELES_NOTE.map((m) => (
            <DropdownMenuItem key={m.id} onSelect={() => onNouvelle(m)}>
              <span className="flex size-8 items-center justify-center rounded-md border border-border-strong bg-surface-2 text-base leading-none">
                {m.icone}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-foreground">{t(`notes.templates.${m.id}.label`)}</span>
                <span className="truncate text-xs text-subtle">
                  {t(`notes.templates.${m.id}.description`)}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
