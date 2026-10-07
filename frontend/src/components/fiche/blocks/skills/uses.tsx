'use client';

/**
 * Usages limités d'une entrée (docs/regles.md « Usages limités ») : utilisations restantes sur
 * le maximum de la période, « 1/1 » ; le détail au survol (« 1 sur 1 par combat »). La pastille
 * consomme une utilisation au clic quand l'entrée ne s'active pas (activer en consomme une) ;
 * le détail de l'entrée ajoute de quoi en rendre une.
 */
import type { Usages } from '@vtt/rules';
import { RotateCcw, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function useUsesText(uses: Usages) {
  const t = useTranslations('sheet.skills.uses');
  const values = { left: uses.restants, max: uses.max };
  return {
    short: t('left', values),
    full: t('tooltip', { ...values, period: t(`per.${uses.par}`) }),
  };
}

const chip =
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium tabular-nums';

/** Pastille des utilisations restantes ; `onUse` : un clic en consomme une. */
export function UsesChip({ uses, onUse }: Readonly<{ uses: Usages; onUse?: () => void }>) {
  const t = useTranslations('sheet.skills.uses');
  const { short, full } = useUsesText(uses);
  const empty = uses.restants <= 0;
  const tone = empty
    ? 'border-border text-subtle'
    : 'border-primary/30 bg-primary/10 text-primary-strong';
  if (!onUse || empty)
    return (
      <span title={full} aria-label={full} className={cn(chip, tone)}>
        <Zap className="size-3" aria-hidden />
        {short}
      </span>
    );
  return (
    <Info texte={`${t('use')} · ${full}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUse();
        }}
        aria-label={`${t('use')} · ${full}`}
        className={cn(
          chip,
          tone,
          'transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Zap className="size-3" aria-hidden />
        {short}
      </button>
    </Info>
  );
}

/** Détail de l'entrée : pastille, consommer (si elle ne s'active pas), rendre une utilisation. */
export function UsesControl({
  uses,
  activable,
  onUse,
}: Readonly<{ uses: Usages; activable: boolean; onUse?: (rendre: boolean) => void }>) {
  const t = useTranslations('sheet.skills.uses');
  return (
    <div className="flex items-center gap-2">
      <UsesChip uses={uses} />
      {onUse && !activable && (
        <Button
          size="xs"
          variant="secondary"
          disabled={uses.restants <= 0}
          onClick={() => onUse(false)}
        >
          <Zap />
          {t('use')}
        </Button>
      )}
      {onUse && (
        <Info texte={t('giveBack')}>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={t('giveBack')}
            disabled={uses.utilises <= 0}
            onClick={() => onUse(true)}
          >
            <RotateCcw />
          </Button>
        </Info>
      )}
    </div>
  );
}
