'use client';

/**
 * Tuile de la vitrine : vignette pré-calculée (aucun canevas, jamais de 3D au
 * survol), nom, liseré de rareté, état (équipé, verrouillé et prix). Un clic
 * la sélectionne : la fiche s'affiche à côté.
 */
import { useSkinText } from '../skin-text';
import { useTranslations } from 'next-intl';
import { Check, Lock } from 'lucide-react';
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { SkinThumbnail } from '../skin-thumbnail';
import type { DiceSkin } from '../three/dice-definitions';
import { prix, RARETES, rareteDe } from './catalogue';

export const SkinTile = memo(function SkinTile({
  skin,
  possede,
  equipe,
  selectionne,
  onSelect,
}: Readonly<{
  skin: DiceSkin;
  possede: boolean;
  equipe: boolean;
  selectionne: boolean;
  onSelect: (id: string) => void;
}>) {
  const t = useTranslations('dice.store');
  const textes = useSkinText();
  const nom = textes.name(skin.id);
  const rarete = rareteDe(skin);
  const r = RARETES[rarete];
  return (
    <button
      type="button"
      id={`skin-${skin.id}`}
      aria-pressed={selectionne}
      aria-label={`${t('tileLabel', { name: nom, rarity: t(`rarities.${rarete}`) })}${equipe ? t('tileEquipped') : ''}${possede ? '' : `, ${prix(skin)}`}`}
      onClick={() => onSelect(skin.id)}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-2xl border bg-card text-left transition-[border-color,box-shadow] duration-150',
        '[contain-intrinsic-size:auto_13rem] [content-visibility:auto]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        selectionne ? 'border-primary shadow-glow' : 'border-border hover:border-border-strong',
      )}
    >
      <span className="relative block aspect-square w-full bg-[radial-gradient(circle_at_50%_40%,hsl(var(--surface-3)),transparent_70%)]">
        <SkinThumbnail
          skinId={skin.id}
          className="absolute inset-0 size-full p-3 transition-transform duration-300 group-hover:scale-[1.06]"
        />
        <span
          className={cn('absolute left-2.5 top-2.5 size-2 rounded-full', r.teinte)}
          aria-hidden
        />
        {equipe && (
          <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
            <Check className="size-3.5" aria-hidden />
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{nom}</span>
        {!possede && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
            <Lock className="size-3" aria-hidden />
            {prix(skin)}
          </span>
        )}
      </span>
      <span className={cn('absolute inset-x-0 bottom-0 h-0.5 opacity-70', r.teinte)} aria-hidden />
    </button>
  );
});
