'use client';

import { AlertCircle, Check, Info as IconeInfo, Sigma } from 'lucide-react';
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
        <span className="sr-only">Formule</span>
        <input
          ref={ref}
          id="formule-des"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={erreur}
          aria-describedby={erreur ? 'formule-des-etat' : undefined}
          placeholder="Écrire une formule… 1d20+5"
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
