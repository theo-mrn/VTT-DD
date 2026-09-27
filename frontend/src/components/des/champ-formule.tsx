'use client';

import { AlertCircle, BookOpen, CheckCircle2, Sigma } from 'lucide-react';
import { forwardRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Verification } from '@/lib/jets';
import { cn } from '@/lib/utils';

const EXEMPLES: { formule: string; sens: string; personnage?: boolean }[] = [
  { formule: '4d6k3', sens: 'Quatre d6, on garde les trois meilleurs' },
  { formule: '2d20k1 + 5', sens: 'Avantage : le meilleur de deux d20, plus 5' },
  { formule: '2d20kl1', sens: 'Désavantage : le pire de deux d20' },
  { formule: '1d6!', sens: 'Dé explosif : relancé et ajouté sur un 6' },
  { formule: '(1d8+2)*2', sens: 'Parenthèses et multiplication' },
  { formule: '1d20 + @FOR', sens: 'Valeur d’un attribut du personnage', personnage: true },
  { formule: '1d20 + mod(@FOR)', sens: 'Modificateur d’un attribut', personnage: true },
];

/**
 * Champ de formule : police à chasse fixe, vérification en direct (le
 * message dit précisément ce qui cloche) et aide-mémoire de la syntaxe.
 */
export const ChampFormule = forwardRef<
  HTMLInputElement,
  {
    valeur: string;
    onChange: (v: string) => void;
    verification: Verification;
    /** Formule telle que le moteur la lit (`D20` → `d20`), si elle diffère. */
    normalisee: string;
    avecPersonnage: boolean;
  }
>(function ChampFormule({ valeur, onChange, verification, normalisee, avecPersonnage }, ref) {
  const [aide, setAide] = useState(false);
  const vide = valeur.trim() === '';
  const erreur = !verification.ok && !vide;

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="relative">
        <Sigma
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          ref={ref}
          id="formule-des"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={erreur}
          aria-describedby="formule-des-etat"
          aria-label="Formule de dés"
          placeholder="2d20k1 + 5"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className="h-12 rounded-xl pl-10 pr-28 font-mono text-base tracking-tight sm:text-[15px]"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <Popover open={aide} onOpenChange={setAide}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  aide && 'bg-surface-3 text-foreground',
                )}
              >
                <BookOpen className="size-3.5" aria-hidden />
                Syntaxe
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] p-0">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Syntaxe des formules</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cliquez sur un exemple pour l’essayer.
                </p>
              </div>
              <ul className="p-1.5">
                {EXEMPLES.map((ex) => (
                  <li key={ex.formule}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(ex.formule);
                        setAide(false);
                      }}
                      className="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:outline-none"
                    >
                      <code className="w-[136px] shrink-0 whitespace-nowrap rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-primary-strong">
                        {ex.formule}
                      </code>
                      <span className="text-xs leading-snug text-muted-foreground group-hover:text-foreground">
                        {ex.sens}
                        {ex.personnage && !avecPersonnage && (
                          <span className="block text-[11px] text-subtle">
                            Choisissez d’abord un personnage
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="border-t border-border px-4 py-2.5 text-[11px] leading-relaxed text-subtle">
                <span className="font-mono text-muted-foreground">D20</span>,{' '}
                <span className="font-mono text-muted-foreground">d%</span> et{' '}
                <span className="font-mono text-muted-foreground">kh1</span> sont aussi compris.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <p
        id="formule-des-etat"
        className={cn(
          'flex min-h-[18px] items-center gap-1.5 text-xs',
          erreur ? 'text-destructive' : 'text-subtle',
        )}
      >
        {vide ? (
          'Ajoutez des dés ou écrivez une formule.'
        ) : !verification.ok ? (
          <>
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {verification.message}
              {verification.position !== null && ` (caractère ${verification.position + 1})`}
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
            <span className="truncate">
              Formule valide
              {normalisee !== valeur.trim() && (
                <>
                  {' '}
                  · lue comme <span className="font-mono text-muted-foreground">{normalisee}</span>
                </>
              )}
            </span>
          </>
        )}
      </p>
    </div>
  );
});
