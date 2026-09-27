'use client';

import { AlertCircle, Check, Info as IconeInfo } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Verification } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { FOCUS, TACTILE } from './tactile';

const EXEMPLES: { formule: string; sens: string; personnage?: boolean }[] = [
  { formule: '1d20 + 5', sens: 'Modificateur' },
  { formule: '2d6 + 1d4', sens: 'Combinaison' },
  { formule: '2d20k1', sens: 'Avantage : le meilleur de deux d20' },
  { formule: '2d20kl1', sens: 'Désavantage : le pire de deux d20' },
  { formule: '4d6k3', sens: 'Quatre d6, on garde les trois meilleurs' },
  { formule: '1d6!', sens: 'Dé explosif : relancé et ajouté sur un 6' },
  { formule: '(1d8+2)*2', sens: 'Parenthèses et calculs' },
  { formule: '1d20 + mod(@FOR)', sens: 'Modificateur d’un attribut du héros', personnage: true },
];

/**
 * Formule en grand, à la manière d'une ligne de saisie : chasse fixe, grise
 * tant qu'elle est vide, éditable. Une petite coche ou un point d'alerte dit
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
  const vide = valeur.trim() === '';
  const erreur = !verification.ok && !vide;

  return (
    <div className="space-y-0.5">
      <div className="relative flex items-center rounded-lg border-b border-transparent transition-colors focus-within:border-primary/60">
        <input
          ref={ref}
          id="formule-des"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={erreur}
          aria-describedby={erreur ? 'formule-des-etat' : undefined}
          aria-label="Formule de dés"
          placeholder="1d20 + 5…"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="go"
          maxLength={100}
          className="h-14 w-full min-w-0 bg-transparent pr-7 font-mono text-[2rem] font-light tracking-tight text-foreground outline-none placeholder:text-subtle"
        />
        {!vide && (
          <span className="pointer-events-none absolute right-1" aria-hidden>
            {erreur ? (
              <AlertCircle className="size-4 text-destructive" />
            ) : (
              <Check className="size-4 text-success" />
            )}
          </span>
        )}
      </div>
      {erreur && !verification.ok && (
        <p id="formule-des-etat" className="truncate text-[11px] leading-4 text-destructive">
          {verification.message}
          {verification.position !== null && ` (caractère ${verification.position + 1})`}
        </p>
      )}
    </div>
  );
});

/** Aide du lanceur (bouton « i ») : gestes, raccourcis, syntaxe ; un exemple s'essaie d'un clic. */
export function AideLanceur({
  onEssayer,
  avecPersonnage,
}: {
  onEssayer: (formule: string) => void;
  avecPersonnage: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Aide du lanceur de dés"
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
          <li>
            <strong className="font-medium text-foreground">Clic sur un dé</strong> : l’ajoute (3
            clics sur d6 = 3d6). Clic droit ou appui long : le retire.
          </li>
          <li>
            <strong className="font-medium text-foreground">+</strong> : avantage, bonus, libellé,
            modificateurs du héros et macros.
          </li>
          <li className="flex flex-wrap items-center gap-1.5">
            <Kbd>↵</Kbd> lancer <Kbd>R</Kbd> relancer <Kbd>1</Kbd>–<Kbd>9</Kbd> macros
          </li>
        </ul>
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
            Syntaxe
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
                  disabled={ex.personnage && !avecPersonnage}
                  title={
                    ex.personnage && !avecPersonnage ? 'Choisissez d’abord un héros' : undefined
                  }
                  className="flex w-full flex-col gap-0.5 rounded-md border border-border bg-surface-2/60 px-2 py-1.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-45"
                >
                  <code className="font-mono text-[11px] text-primary-strong">{ex.formule}</code>
                  <span className="text-[10px] leading-tight text-subtle">{ex.sens}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
