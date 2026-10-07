'use client';

/**
 * Pièces qui lancent, dans la langue du lanceur de dés et de la fiche (docs/combat.md § 12.1) :
 *
 * - `TypeCard` : grande carte d'un type d'attaque (Contact, Distance, Magie, Libre) : le dé de
 *   sa formule (`DeVisuel` du lanceur), le nom en entier, la formule (« 1d20 + 5 ») ; un clic
 *   lance le jet. Reprise des grandes cartes de l'ancienne page d'attaque.
 * - `SourceCard` : tuile d'une arme, d'un sort ou d'une action, comme les tuiles d'action de la
 *   fiche (icône en carré, nom, champs en puces) ; en « lancer » (flèche) ou en « choisir ».
 * - `LaunchButton` : le bouton « Lancer » du lanceur de dés, tel quel.
 *
 * Touches 1 à 9 : l'écran marque ses cartes (`data-shortcut`), le menu les déclenche.
 */
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, Dices, Send, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { DeVisuel } from '@/components/des/de-visuel';
import { FOCUS, TACTILE } from '@/components/des/tactile';
import { Kbd } from '@/components/ui/kbd';
import { firstDieFaces } from '@/lib/combat/actions';
import { cn } from '@/lib/utils';

/** Entrée décalée des cartes d'une grille (30 à 40 ms chacune, rien en mouvement réduit). */
export function Stagger({
  index,
  children,
  className,
}: Readonly<{
  index: number;
  children: ReactNode;
  className?: string;
}>) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 9) * 0.04 }}
    >
      {children}
    </motion.div>
  );
}

/** Pastille de raccourci (souris et clavier seulement). */
function ShortcutKbd({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <Kbd aria-hidden className={cn('[@media(pointer:coarse)]:hidden', className)}>
      {children}
    </Kbd>
  );
}

export const TypeCard = forwardRef<
  HTMLButtonElement,
  {
    title: string;
    formula: string | null;
    shortcut: number | null;
    /** Le type de la dernière attaque : Entrée le relance. */
    active: boolean;
    /** Carte dépliée (options propres ouvertes : « Libre »). */
    expanded?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }
>(function TypeCard({ title, formula, shortcut, active, expanded, disabled, onClick }, ref) {
  const t = useTranslations();
  const faces = firstDieFaces(formula);
  return (
    <button
      ref={ref}
      type="button"
      data-shortcut={shortcut ?? undefined}
      aria-keyshortcuts={shortcut ? String(shortcut) : undefined}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group relative isolate flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border bg-card px-3 py-5 text-center shadow-surface sm:min-h-[13rem] sm:gap-4 sm:px-5',
        'transition-[transform,border-color,box-shadow,background-color] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-glow active:scale-[0.98] motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100',
        'disabled:pointer-events-none disabled:opacity-45',
        FOCUS,
        active || expanded ? 'border-primary/45 bg-primary/[0.06]' : 'border-border',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 -z-10 bg-dots opacity-0 mask-radial transition-opacity duration-300 group-hover:opacity-70"
      />
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 -z-10 bg-halo transition-opacity duration-300 group-hover:opacity-100',
          active || expanded ? 'opacity-100' : 'opacity-0',
        )}
      />
      {shortcut !== null && (
        <ShortcutKbd className="absolute left-3 top-3 max-sm:hidden">{shortcut}</ShortcutKbd>
      )}
      {active && !expanded && (
        <ShortcutKbd className="absolute right-3 top-3 max-sm:hidden">
          {t('chat.enterKey')}
        </ShortcutKbd>
      )}
      <span className="transition-transform duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transition-none">
        {faces ? (
          <DeVisuel faces={faces} taille="lg" className="max-sm:size-12 max-sm:text-sm" />
        ) : (
          <span className="grid size-12 place-items-center rounded-xl border border-border-strong bg-surface-3 text-primary sm:size-16">
            <Dices className="size-6 sm:size-7" aria-hidden />
          </span>
        )}
      </span>
      <span className="text-balance font-display text-xl font-semibold leading-tight sm:text-2xl">
        {title}
      </span>
      {formula && (
        <span className="rounded-full border border-border-strong bg-surface-2/80 px-3 py-1 font-mono text-sm font-semibold tabular text-foreground sm:text-base">
          {formula}
        </span>
      )}
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 bottom-0 h-0.5 origin-center bg-primary transition-transform duration-300 group-hover:scale-x-100',
          expanded ? 'scale-x-100' : 'scale-x-0',
        )}
      />
    </button>
  );
});

export interface SourceField {
  key: string;
  label: string;
  value: string;
  /** Formule (dégâts) : mise en avant. */
  formula?: boolean;
}

/**
 * Tuile d'une source (arme, sort, action) : icône en carré, nom, champs en puces. `launch` :
 * un clic lance (flèche au survol) ; sinon un choix exclusif (point coché).
 */
export function SourceCard({
  icon: Icon,
  name,
  note,
  fields,
  mode,
  selected = false,
  shortcut,
  disabled,
  onClick,
}: Readonly<{
  icon: LucideIcon;
  name: string;
  /** Précision sous le nom (« Toujours disponible », « Catalogue »). */
  note?: string | null;
  fields: readonly SourceField[];
  mode: 'launch' | 'select';
  selected?: boolean;
  shortcut?: number | null;
  disabled?: boolean;
  onClick: () => void;
}>) {
  const formula = fields.find((f) => f.formula);
  const rest = fields.filter((f) => f !== formula);
  return (
    <button
      type="button"
      role={mode === 'select' ? 'radio' : undefined}
      aria-checked={mode === 'select' ? selected : undefined}
      data-shortcut={shortcut ?? undefined}
      aria-keyshortcuts={shortcut ? String(shortcut) : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group relative flex h-full w-full items-center gap-3 rounded-xl border p-3 text-left',
        'transition-[transform,border-color,background-color,box-shadow] duration-150',
        'hover:-translate-y-0.5 hover:border-primary/40 active:scale-[0.99] motion-reduce:hover:translate-y-0',
        'disabled:pointer-events-none disabled:opacity-45',
        FOCUS,
        TACTILE,
        selected ? 'border-primary/45 bg-primary/10 shadow-glow' : 'border-border bg-surface-2/50',
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors',
          selected
            ? 'border-primary/40 bg-primary/15 text-primary'
            : 'border-border-strong bg-surface-3 text-primary group-hover:border-primary/40',
        )}
      >
        <Icon className="size-[1.125rem]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 text-sm font-semibold leading-snug">{name}</span>
          {note && <span className="shrink-0 text-[11px] text-subtle">{note}</span>}
        </span>
        {(formula || rest.length > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {formula && (
              <span className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[12px] font-semibold tabular text-primary-strong">
                {formula.value}
              </span>
            )}
            {rest.map((f) => (
              <span
                key={f.key}
                className="inline-flex max-w-full items-baseline gap-1 truncate rounded-md bg-surface-3/80 px-1.5 py-0.5 text-[11px]"
              >
                <span className="text-subtle">{f.label}</span>
                {f.value && (
                  <span className="truncate font-mono font-medium text-foreground">{f.value}</span>
                )}
              </span>
            ))}
          </span>
        )}
      </span>
      {shortcut != null && <ShortcutKbd className="shrink-0 max-sm:hidden">{shortcut}</ShortcutKbd>}
      {mode === 'launch' ? (
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-subtle transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
        >
          <ArrowRight className="size-3.5" />
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border-strong text-transparent',
          )}
        >
          <Check className="size-3" strokeWidth={3.5} />
        </span>
      )}
    </button>
  );
}

/** Bouton « Lancer » du lanceur de dés (mêmes classes), avec un contenu libre. */
export const LaunchButton = forwardRef<
  HTMLButtonElement,
  {
    children: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    busy?: boolean;
    /** Entrée le déclenche : la touche est rappelée. */
    enter?: boolean;
    size?: 'md' | 'lg';
    className?: string;
  }
>(function LaunchButton({ children, onClick, disabled, busy, enter, size = 'md', className }, ref) {
  const t = useTranslations();
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-keyshortcuts={enter ? 'Enter' : undefined}
      className={cn(
        'group flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary pl-4 pr-3 font-bold uppercase tracking-wide text-primary-foreground shadow-glow transition-[background-color,transform,opacity] hover:bg-primary-strong active:scale-95 disabled:opacity-50 disabled:shadow-none motion-reduce:active:scale-100',
        size === 'md' ? 'h-9 text-xs' : 'h-12 px-6 text-[13px]',
        FOCUS,
        '[@media(pointer:coarse)]:h-11',
        size === 'lg' && '[@media(pointer:coarse)]:h-12',
        className,
      )}
    >
      {children}
      {enter && !busy && !disabled && (
        <Kbd className="border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground max-sm:hidden">
          {t('chat.enterKey')}
        </Kbd>
      )}
      <Send
        className={cn(
          'size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none',
          busy && 'animate-pulse',
        )}
        aria-hidden
      />
    </button>
  );
});
