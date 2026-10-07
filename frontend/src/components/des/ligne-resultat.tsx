'use client';

import { motion } from 'framer-motion';
import { EyeOff, History, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { translate } from '@/i18n/runtime';
import type { Jet } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { FOCUS, TACTILE } from './tactile';

/** Phrase lue par les lecteurs d'écran à chaque nouveau jet. */
function annonce(jet: Jet): string {
  return translate('dice.result.announce', {
    label: jet.label ? translate('dice.result.announceLabel', { label: jet.label }) : '',
    result: jet.hidden
      ? translate('dice.result.announceHidden')
      : (jet.symbolResult ?? String(jet.total)),
    critical: jet.critical ?? 'none',
    formula: jet.formula,
  });
}

/** Détail du service (« 1d20+3 = [17]+3 = 20 ») sans la formule ni le total : « [17]+3 ». */
export function detailJet(jet: Jet): string {
  const parties = jet.output.split('=').map((p) => p.trim());
  return parties.length >= 3 ? parties.slice(1, -1).join(' = ') : '';
}

/** Total du jet (ou son résultat à symboles), coloré s'il est critique ; masqué s'il est caché. */
function TotalAffiche({ jet, anime }: Readonly<{ jet: Jet; anime: boolean }>) {
  const t = useTranslations('dice.result');
  if (jet.hidden || jet.total === null)
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-subtle">
        <EyeOff className="size-3.5" aria-hidden />
        {t('hidden')}
      </span>
    );
  return (
    <motion.span
      key={jet.id}
      initial={anime ? { opacity: 0, y: 6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 360, damping: 24 }}
      className={cn(
        'shrink-0 font-mono leading-none tabular',
        'text-base font-semibold',
        jet.critical === 'success' && 'text-gradient-primary',
        jet.critical === 'failure' && 'text-destructive',
        !jet.critical && 'text-foreground',
      )}
    >
      {jet.symbolResult ?? jet.total}
    </motion.span>
  );
}

/**
 * Dernier résultat, sur une petite ligne sous la formule : total en gras,
 * détail discret. Il n'arrive qu'une fois les dés 3D arrêtés ; pendant qu'ils
 * roulent, la ligne dit « Lancement… ».
 */
export function LigneResultat({
  jet,
  anime,
  enCours,
  onRelancer,
}: Readonly<{
  jet: Jet | null;
  anime: boolean;
  enCours: boolean;
  onRelancer: () => void;
}>) {
  const t = useTranslations('dice.result');
  return (
    <div className="flex min-h-7 items-center gap-2 px-1">
      <p aria-live="polite" aria-atomic className="sr-only">
        {jet && anime ? annonce(jet) : ''}
      </p>
      {(enCours || jet) && (
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-subtle">
          <History className="size-3" aria-hidden />
          {t('lastRoll')}
        </span>
      )}
      {enCours && (
        <p className="animate-pulse font-mono text-xs text-subtle motion-reduce:animate-none">
          {t('rolling')}
        </p>
      )}
      {!enCours && jet && (
        <>
          <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
            <TotalAffiche jet={jet} anime={anime} />
            {!jet.hidden && detailJet(jet) && (
              <span className="shrink-0 font-mono text-xs text-subtle">= {detailJet(jet)}</span>
            )}
            <span className="min-w-0 truncate font-mono text-xs text-subtle">
              ({jet.label ? `${jet.label} · ` : ''}
              {jet.formula})
            </span>
            {jet.critical && (
              <span
                className={cn(
                  'shrink-0 text-[10px] font-semibold uppercase tracking-wider',
                  jet.critical === 'success' ? 'text-primary-strong' : 'text-destructive',
                )}
              >
                {jet.critical === 'success' ? t('critical') : t('fumble')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onRelancer}
            aria-label={t('reroll')}
            aria-keyshortcuts="R"
            title={t('rerollKey')}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-surface-3 hover:text-foreground',
              FOCUS,
              TACTILE,
            )}
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
