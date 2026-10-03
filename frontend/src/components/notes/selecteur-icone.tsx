'use client';

import { Search, Shuffle, SmilePlus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { normaliser } from './outils';

/** Emojis utiles à la table (le nom sert à la recherche et aux lecteurs d'écran). */
export const EMOJIS_NOTE: { e: string; nom: string }[] = [
  { e: '📝', nom: 'note' },
  { e: '📖', nom: 'livre journal' },
  { e: '📜', nom: 'parchemin' },
  { e: '🗺️', nom: 'carte' },
  { e: '🧭', nom: 'boussole quête' },
  { e: '🏰', nom: 'château' },
  { e: '🏛️', nom: 'temple' },
  { e: '🏔️', nom: 'montagne' },
  { e: '🌲', nom: 'forêt' },
  { e: '⛵', nom: 'navire' },
  { e: '🍺', nom: 'taverne bière' },
  { e: '🧙', nom: 'mage' },
  { e: '🧝', nom: 'elfe' },
  { e: '🧌', nom: 'troll' },
  { e: '🐉', nom: 'dragon' },
  { e: '🐺', nom: 'loup' },
  { e: '🦉', nom: 'chouette' },
  { e: '🕷️', nom: 'araignée' },
  { e: '👑', nom: 'couronne roi' },
  { e: '💀', nom: 'crâne mort' },
  { e: '👻', nom: 'fantôme' },
  { e: '😈', nom: 'démon' },
  { e: '⚔️', nom: 'épées combat' },
  { e: '🛡️', nom: 'bouclier' },
  { e: '🏹', nom: 'arc' },
  { e: '🗡️', nom: 'dague' },
  { e: '🪄', nom: 'baguette magie' },
  { e: '🔮', nom: 'boule de cristal' },
  { e: '🧪', nom: 'potion' },
  { e: '🗝️', nom: 'clé' },
  { e: '💰', nom: 'bourse trésor' },
  { e: '💎', nom: 'gemme' },
  { e: '🪙', nom: 'pièce' },
  { e: '🎲', nom: 'dé' },
  { e: '🕯️', nom: 'bougie' },
  { e: '🔥', nom: 'feu' },
  { e: '❄️', nom: 'glace' },
  { e: '⚡', nom: 'foudre' },
  { e: '🌙', nom: 'lune nuit' },
  { e: '☀️', nom: 'soleil' },
  { e: '🌿', nom: 'herbe plante' },
  { e: '❤️', nom: 'cœur' },
  { e: '⭐', nom: 'étoile' },
  { e: '❓', nom: 'mystère question' },
  { e: '⚠️', nom: 'danger' },
  { e: '✅', nom: 'fait terminé' },
  { e: '📌', nom: 'punaise' },
  { e: '🎭', nom: 'masques théâtre' },
];

/**
 * Choix de l'icône d'une note : grille d'emojis, recherche par nom, tirage au
 * sort et retrait. `children` sert de déclencheur.
 */
export function SelecteurIcone({
  valeur,
  onChoix,
  children,
}: Readonly<{
  valeur: string | null;
  onChoix: (emoji: string | null) => void;
  children: ReactNode;
}>) {
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState('');
  const visibles = useMemo(() => {
    const f = normaliser(filtre.trim());
    return f ? EMOJIS_NOTE.filter((x) => normaliser(x.nom).includes(f)) : EMOJIS_NOTE;
  }, [filtre]);

  const choisir = (e: string | null) => {
    onChoix(e);
    setOuvert(false);
    setFiltre('');
  };

  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[296px] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-3.5 shrink-0 text-subtle" aria-hidden />
          <input
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visibles[0]) {
                e.preventDefault();
                choisir(visibles[0].e);
              }
            }}
            placeholder="Filtrer : dragon, clé, carte…"
            aria-label="Filtrer les icônes"
            className="h-10 w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle focus-visible:outline-none"
          />
        </div>
        <div
          role="listbox"
          aria-label="Icônes"
          className="grid max-h-[232px] grid-cols-8 gap-0.5 overflow-y-auto p-2"
        >
          {visibles.map((x) => (
            <button
              key={x.e}
              type="button"
              role="option"
              aria-selected={valeur === x.e}
              aria-label={x.nom}
              title={x.nom}
              onClick={() => choisir(x.e)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md text-[19px] leading-none transition-[background-color,transform] duration-100',
                'hover:scale-110 hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                valeur === x.e && 'bg-primary/15 ring-1 ring-primary/40',
              )}
            >
              {x.e}
            </button>
          ))}
          {!visibles.length && (
            <p className="col-span-8 py-6 text-center text-xs text-subtle">
              Aucune icône ne correspond.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => choisir(EMOJIS_NOTE[Math.floor(Math.random() * EMOJIS_NOTE.length)].e)}
          >
            <Shuffle />
            Au hasard
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={!valeur}
            onClick={() => choisir(null)}
            className="hover:text-destructive"
          >
            <Trash2 />
            Retirer
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Déclencheur discret quand la note n'a pas encore d'icône. */
export function BoutonAjoutIcone(props: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-subtle transition-[color,background-color,opacity] duration-150',
        'hover:bg-surface-2 hover:text-muted-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        'data-[state=open]:bg-surface-2 data-[state=open]:opacity-100',
        props.className,
      )}
    >
      <SmilePlus className="size-4" />
      Ajouter une icône
    </button>
  );
}
