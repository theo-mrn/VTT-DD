'use client';

/**
 * Barre au-dessus de la fiche, reprise de l'ancienne app : un bouton par
 * personnage pour passer de l'un à l'autre, puis le menu « Actions ».
 */
import { ArrowLeft, Loader2, Pencil, Settings, Sparkles, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { listCharacters } from '@/lib/characters';
import { useResource } from '@/lib/resource';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { DeleteDialog, RenameDialog } from './header';
import { focus, textMuted } from './styles';

const barButton = cn(
  'flex shrink-0 items-center gap-1 rounded-lg border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] p-2 text-xs text-[color:var(--fiche-texte-secondaire)] transition duration-200 hover:bg-[color:var(--fiche-carte)] sm:text-sm',
  focus,
);

export function SheetToolbar() {
  const { character, state, readOnly, pending } = useSheet();
  const characters = useResource('personnages', listCharacters);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const list = [...(characters.data ?? [])].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  if (!list.some((c) => c.id === character.id))
    list.unshift({
      id: character.id,
      nom: character.nom,
      avatarUrl: character.avatarUrl,
      systeme: state.systeme,
      type: state.type,
      creation: state.creation,
      updatedAt: character.updatedAt,
    });

  return (
    <div className="relative z-10 mx-auto mb-6 flex max-w-5xl items-center justify-between gap-4 rounded-lg bg-[color:var(--fiche-carte)] p-2 shadow-md">
      <nav
        aria-label="Mes personnages"
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:thin]"
      >
        <Link
          href="/characters"
          className={barButton}
          title="Mes personnages"
          aria-label="Mes personnages"
        >
          <ArrowLeft size={16} aria-hidden />
        </Link>
        {list.map((c) => {
          const current = c.id === character.id;
          return (
            <Link
              key={c.id}
              href={c.creation ? `/characters/${c.id}/creation` : `/characters/${c.id}`}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold text-black transition sm:px-4 sm:text-sm',
                current
                  ? 'bg-[color:var(--fiche-accent-survol)] ring-2 ring-[color:var(--fiche-accent)] ring-offset-1 ring-offset-[color:var(--fiche-carte)]'
                  : 'bg-[color:var(--fiche-accent)] hover:bg-[color:var(--fiche-accent-survol)]',
                focus,
              )}
            >
              {c.nom}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <span aria-live="polite" className={cn(textMuted, 'text-xs')}>
          {pending > 0 && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              <span className="hidden sm:inline">Enregistrement…</span>
            </span>
          )}
        </span>
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger className={barButton} title="Plus d'actions">
              <Settings size={16} aria-hidden />
              <span className="hidden sm:inline">Actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="z-50 w-56 border-zinc-800 bg-[#0c0c0e] text-white"
            >
              {state.creation && (
                <DropdownMenuItem asChild className="cursor-pointer gap-2">
                  <Link href={`/characters/${character.id}/creation`}>
                    <Sparkles className="h-4 w-4" />
                    Reprendre la création
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setRenaming(true)} className="cursor-pointer gap-2">
                <Pencil className="h-4 w-4" />
                Renommer
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-zinc-800" />
              <DropdownMenuItem
                onSelect={() => setRemoving(true)}
                className="cursor-pointer gap-2 text-red-400 focus:bg-red-500/20 focus:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <RenameDialog open={renaming} onClose={() => setRenaming(false)} />
      <DeleteDialog open={removing} onClose={() => setRemoving(false)} />
    </div>
  );
}
