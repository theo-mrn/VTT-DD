'use client';

/**
 * Petites pièces du bloc Inventaire : vignette d'une entrée du catalogue, étiquettes de
 * bonus. Aucune clé de jeu : l'icône se déduit de la forme de la sorte (`iconeSorte`).
 */
import type { Sorte } from '@vtt/rules';
import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Info } from '@/components/ui/tooltip';
import { vignette } from '@/lib/assets';
import { cn } from '@/lib/utils';
import { iconeSorte } from './item-icon';
import type { BonusLabel } from './model';

/** Image de l'entrée déclarée par la présentation, sinon l'icône de sa sorte. */
export function Thumbnail({
  image,
  sorte,
  className,
}: Readonly<{
  nom?: string;
  image?: string;
  sorte?: Pick<Sorte, 'champs' | 'activable' | 'quantites'>;
  className?: string;
}>) {
  const Icone = sorte ? iconeSorte(sorte) : Package;
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-subtle',
        className,
      )}
    >
      {image ? (
        <img src={vignette(image, 72)} alt="" className="size-full object-cover" />
      ) : (
        <Icone className="size-4" />
      )}
    </span>
  );
}

/** Étiquettes des bonus d'un objet ; `max` : au-delà, un compteur « +n ». */
export function BonusBadges({
  bonus,
  max,
  taille = 'sm',
}: Readonly<{
  bonus: BonusLabel[];
  max?: number;
  taille?: 'sm' | 'md';
}>) {
  if (!bonus.length) return null;
  const montres = max === undefined ? bonus : bonus.slice(0, max);
  const reste = bonus.length - montres.length;
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {montres.map((b, i) => {
        const aide = [
          b.description,
          b.conditionnel ? 'Sous condition' : null,
          b.ignore ? 'Non cumulé : un effet de la même famille est plus fort' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Info key={`${b.texte}-${i}`} texte={aide || null}>
            <Badge
              ton={b.ignore ? 'neutre' : 'primaire'}
              taille={taille}
              className={cn('max-w-full', b.ignore && 'line-through decoration-subtle')}
              tabIndex={aide ? 0 : undefined}
            >
              <span className="truncate">{b.texte}</span>
              {b.conditionnel && <span aria-hidden>*</span>}
            </Badge>
          </Info>
        );
      })}
      {reste > 0 && (
        <Info
          texte={bonus
            .slice(montres.length)
            .map((b) => b.texte)
            .join(' · ')}
        >
          <Badge taille={taille} tabIndex={0}>
            +{reste}
          </Badge>
        </Info>
      )}
    </div>
  );
}
