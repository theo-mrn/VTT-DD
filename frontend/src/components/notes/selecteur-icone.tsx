'use client';

import { useTranslations } from 'next-intl';
import { Search, Shuffle, SmilePlus, Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { normaliser } from './outils';

/** Emojis utiles à la table ; nom (recherche, lecteurs d'écran) : `notes.icons.<id>`. */
export const EMOJIS_NOTE = [
  { e: '📝', id: 'note' },
  { e: '📖', id: 'book' },
  { e: '📜', id: 'scroll' },
  { e: '🗺️', id: 'map' },
  { e: '🧭', id: 'compass' },
  { e: '🏰', id: 'castle' },
  { e: '🏛️', id: 'temple' },
  { e: '🏔️', id: 'mountain' },
  { e: '🌲', id: 'forest' },
  { e: '⛵', id: 'ship' },
  { e: '🍺', id: 'tavern' },
  { e: '🧙', id: 'wizard' },
  { e: '🧝', id: 'elf' },
  { e: '🧌', id: 'troll' },
  { e: '🐉', id: 'dragon' },
  { e: '🐺', id: 'wolf' },
  { e: '🦉', id: 'owl' },
  { e: '🕷️', id: 'spider' },
  { e: '👑', id: 'crown' },
  { e: '💀', id: 'skull' },
  { e: '👻', id: 'ghost' },
  { e: '😈', id: 'demon' },
  { e: '⚔️', id: 'swords' },
  { e: '🛡️', id: 'shield' },
  { e: '🏹', id: 'bow' },
  { e: '🗡️', id: 'dagger' },
  { e: '🪄', id: 'wand' },
  { e: '🔮', id: 'crystal' },
  { e: '🧪', id: 'potion' },
  { e: '🗝️', id: 'key' },
  { e: '💰', id: 'purse' },
  { e: '💎', id: 'gem' },
  { e: '🪙', id: 'coin' },
  { e: '🎲', id: 'die' },
  { e: '🕯️', id: 'candle' },
  { e: '🔥', id: 'fire' },
  { e: '❄️', id: 'ice' },
  { e: '⚡', id: 'lightning' },
  { e: '🌙', id: 'moon' },
  { e: '☀️', id: 'sun' },
  { e: '🌿', id: 'herb' },
  { e: '❤️', id: 'heart' },
  { e: '⭐', id: 'star' },
  { e: '❓', id: 'mystery' },
  { e: '⚠️', id: 'danger' },
  { e: '✅', id: 'done' },
  { e: '📌', id: 'pin' },
  { e: '🎭', id: 'masks' },
] as const;

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
  const t = useTranslations();
  const [ouvert, setOuvert] = useState(false);
  const [filtre, setFiltre] = useState('');
  const visibles = useMemo(() => {
    const f = normaliser(filtre.trim());
    const tous = EMOJIS_NOTE.map((x) => ({ e: x.e, nom: t(`notes.icons.${x.id}`) }));
    return f ? tous.filter((x) => normaliser(x.nom).includes(f)) : tous;
  }, [filtre, t]);

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
            placeholder={t('notes.iconFilter')}
            aria-label={t('notes.iconFilterLabel')}
            className="h-10 w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle focus-visible:outline-none"
          />
        </div>
        <div
          role="listbox"
          aria-label={t('notes.iconsTitle')}
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
            <p className="col-span-8 py-6 text-center text-xs text-subtle">{t('notes.noIcon')}</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-1.5">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => choisir(EMOJIS_NOTE[Math.floor(Math.random() * EMOJIS_NOTE.length)].e)}
          >
            <Shuffle />
            {t('notes.random')}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={!valeur}
            onClick={() => choisir(null)}
            className="hover:text-destructive"
          >
            <Trash2 />
            {t('common.actions.remove')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Déclencheur discret quand la note n'a pas encore d'icône. */
export function BoutonAjoutIcone(props: React.ComponentProps<'button'>) {
  const t = useTranslations();
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
      {t('notes.addIcon')}
    </button>
  );
}
