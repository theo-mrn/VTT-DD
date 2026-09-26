'use client';

/** Éléments communs aux blocs de la fiche : cadre de bloc, explication au survol, dialogue. */
import type { LigneExplication } from '@vtt/rules';
import { useId, useRef, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useFiche } from './contexte';
import { formaterValeur, LIBELLES_OPERATION, SYMBOLES_OPERATION } from './format';
import { carte, focus, policeTitres, texte, texteAccent, texteSecondaire } from './styles';

// ─── Bloc ────────────────────────────────────────────────────────────────────

export function Bloc({
  titre,
  action,
  children,
  className,
}: {
  titre: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn(carte, className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className={cn(policeTitres, texteAccent, 'text-base tracking-wide sm:text-lg')}>
          {titre}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function VideFiche({ children }: { children: ReactNode }) {
  return (
    <p
      className={cn(
        texteSecondaire,
        'rounded-lg border border-dashed border-[color:var(--fiche-bordure)] px-3 py-4 text-center text-sm',
      )}
    >
      {children}
    </p>
  );
}

// ─── Explication d'une valeur ────────────────────────────────────────────────

/**
 * Valeur cliquable dont le détail du calcul s'affiche au survol, au focus
 * clavier ou au toucher (mobile).
 */
export function Explication({
  titre,
  detail,
  children,
  className,
}: {
  titre: string;
  detail: LigneExplication[] | undefined;
  children: ReactNode;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const id = useId();
  const survol = useRef(false);
  const lignes = detail ?? [];
  if (!lignes.length) return <div className={className}>{children}</div>;

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => {
        survol.current = true;
        setOuvert(true);
      }}
      onMouseLeave={() => {
        survol.current = false;
        setOuvert(false);
      }}
    >
      <button
        type="button"
        aria-describedby={ouvert ? id : undefined}
        aria-expanded={ouvert}
        aria-label={`${titre} : voir le détail du calcul`}
        onClick={() => !survol.current && setOuvert((o) => !o)}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOuvert(false)}
        className={cn('w-full text-left', focus, className)}
      >
        {children}
      </button>
      {ouvert && (
        <div
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-fond-profond)] p-3 text-left shadow-xl"
        >
          <p className={cn(texte, 'mb-2 text-sm font-semibold')}>{titre}</p>
          <ul className="space-y-1">
            {lignes.map((l, i) => (
              <li
                key={i}
                className={cn(
                  'flex items-baseline justify-between gap-3 text-xs',
                  l.ignore ? 'text-[color:var(--fiche-texte-secondaire)] line-through' : texte,
                )}
                title={LIBELLES_OPERATION[l.operation]}
              >
                <span className="min-w-0 truncate">{l.nom}</span>
                <span className="shrink-0 tabular-nums">
                  <span className={texteSecondaire}>{SYMBOLES_OPERATION[l.operation]}</span>{' '}
                  {formaterValeur(undefined, l.valeur)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Dialogue aux couleurs de la fiche ───────────────────────────────────────

/** Dialogue rendu hors du cadre (portail) : il repose lui-même les variables du thème. */
export function DialogueFiche({
  ouvert,
  onFermer,
  titre,
  description,
  children,
  large,
}: {
  ouvert: boolean;
  onFermer(): void;
  titre: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  large?: boolean;
}) {
  const { variables } = useFiche();
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className={large ? 'sm:max-w-2xl' : 'sm:max-w-lg'}>
        <div style={variables} className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
          <DialogHeader>
            <DialogTitle className={cn(policeTitres, 'pr-8 text-white')}>{titre}</DialogTitle>
            <DialogDescription className={cn(texteSecondaire, !description && 'sr-only')}>
              {description ?? titre}
            </DialogDescription>
          </DialogHeader>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recherche ───────────────────────────────────────────────────────────────

/** Normalise un texte pour la recherche (casse et accents ignorés). */
export function normaliser(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
