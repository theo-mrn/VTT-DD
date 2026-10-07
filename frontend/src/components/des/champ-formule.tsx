'use client';

import { AlertCircle, Check, Info as IconeInfo, Sigma } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { forwardRef, useState } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Verification } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { FOCUS, TACTILE } from './tactile';

/** Exemples de l'aide ; leur sens : `dice.formula.examples.<sens>`. */
const EXEMPLES = [
  { formule: '1d20 + 5', sens: 'modifier' },
  { formule: '2d6 + 1d4', sens: 'combination' },
  { formule: '2d20k1', sens: 'advantage' },
  { formule: '2d20kl1', sens: 'disadvantage' },
  { formule: '4d6k3', sens: 'keepHighest' },
  { formule: '1d6!', sens: 'exploding' },
  { formule: '(1d8+2)*2', sens: 'math' },
  { formule: '1d20 + CON', sens: 'heroModifier', personnage: true },
  { formule: '1d20 + @CON', sens: 'heroValue', personnage: true },
] as const;

/**
 * Champ de la formule, bien visible comme tel : cadre, fond en creux, Σ à
 * gauche, placeholder grisé, anneau d'accent au focus. Une petite coche ou un point d'alerte dit
 * discrètement si elle est lisible ; le détail de l'erreur vient dessous.
 */
export const ChampFormule = forwardRef<
  HTMLInputElement,
  {
    valeur: string;
    onChange: (v: string) => void;
    verification: Verification;
  }
>(function ChampFormule({ valeur, onChange, verification }, ref) {
  const t = useTranslations('dice.formula');
  const vide = valeur.trim() === '';
  const erreur = !verification.ok && !vide;

  return (
    <div className="space-y-0.5">
      {/* Toute la zone est une étiquette : un clic n'importe où place le curseur dans le champ */}
      <label
        htmlFor="formule-des"
        className="relative flex cursor-text items-center gap-2 rounded-xl border border-border-strong bg-background/70 pl-3 pr-2 shadow-[inset_0_1px_2px_0_hsl(0_0%_0%/0.25)] transition-[border-color,box-shadow] hover:border-primary/40 focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/30 has-[[aria-invalid=true]]:border-destructive/60"
      >
        <Sigma className="size-4 shrink-0 text-subtle" aria-hidden />
        <span className="sr-only">{t('label')}</span>
        <input
          ref={ref}
          id="formule-des"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={erreur}
          aria-describedby={erreur ? 'formule-des-etat' : undefined}
          placeholder={t('placeholder')}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="go"
          maxLength={100}
          className="h-12 w-full min-w-0 cursor-text bg-transparent font-mono text-2xl tracking-tight text-foreground outline-none placeholder:font-sans placeholder:text-base placeholder:italic placeholder:text-subtle/80"
        />
        {!vide && (
          <span className="pointer-events-none shrink-0" aria-hidden>
            {erreur ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <Check className="size-4 text-success" />
            )}
          </span>
        )}
      </label>
      {erreur && !verification.ok && (
        <p id="formule-des-etat" className="truncate text-[11px] leading-4 text-destructive">
          {verification.position !== null
            ? t('position', {
                message: verification.message,
                position: verification.position + 1,
              })
            : verification.message}
        </p>
      )}
    </div>
  );
});

/** Aide du lanceur (bouton « i ») : gestes, raccourcis, syntaxe ; un exemple s'essaie d'un clic. */
export function AideLanceur({
  onEssayer,
  avecPersonnage,
}: Readonly<{
  onEssayer: (formule: string) => void;
  avecPersonnage: boolean;
}>) {
  const t = useTranslations('dice.formula');
  const [ouvert, setOuvert] = useState(false);
  const fort = (chunks: React.ReactNode) => (
    <strong className="font-medium text-foreground">{chunks}</strong>
  );
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('help')}
          className={cn(
            'flex size-6 items-center justify-center rounded-full text-subtle transition-colors hover:text-foreground',
            FOCUS,
            TACTILE,
          )}
        >
          <IconeInfo className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(340px,calc(100vw-2rem))] space-y-3 p-3">
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>{t.rich('helpClick', { b: fort })}</li>
          <li>{t.rich('helpAttributes', { b: fort })}</li>
          <li>{t.rich('helpPlus', { b: fort })}</li>
          <li className="flex flex-wrap items-center gap-1.5">
            <Kbd>↵</Kbd> {t('keysRoll')} <Kbd>R</Kbd> {t('keysReroll')} <Kbd>1</Kbd>–<Kbd>9</Kbd>{' '}
            {t('keysMacros')}
          </li>
        </ul>
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
            {t('syntax')}
          </p>
          <ul className="grid grid-cols-2 gap-1">
            {EXEMPLES.map((ex) => (
              <li key={ex.formule}>
                <button
                  type="button"
                  onClick={() => {
                    onEssayer(ex.formule);
                    setOuvert(false);
                  }}
                  disabled={'personnage' in ex && !avecPersonnage}
                  title={'personnage' in ex && !avecPersonnage ? t('pickHeroFirst') : undefined}
                  className="flex w-full flex-col gap-0.5 rounded-md border border-border bg-surface-2/60 px-2 py-1.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-45"
                >
                  <code className="font-mono text-[11px] text-primary-strong">{ex.formule}</code>
                  <span className="text-[10px] leading-tight text-subtle">
                    {t(`examples.${ex.sens}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
