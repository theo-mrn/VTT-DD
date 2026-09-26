'use client';

/**
 * Habillage repris de l'ancienne fiche : cadre doré à ornements d'angle,
 * cartes à bordure fine et petits titres en capitales. Les couleurs viennent
 * du thème de la présentation (variables `--fiche-*`).
 */
import { Component, useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { panel, text, widgetLabel } from './styles';

/** Image de fond déclarée par la présentation, si c'est une adresse utilisable telle quelle. */
function backgroundImage(source: string | undefined): string | undefined {
  if (!source) return undefined;
  return /^(https?:)?\/\//.test(source) || source.startsWith('/') ? source : undefined;
}

function Corner({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'absolute flex h-8 w-8 rotate-45 items-center justify-center bg-[color:var(--fiche-fond)]',
        className,
      )}
    >
      <div className="absolute inset-0 border-[3px] border-[color:var(--fiche-accent)]" />
      <div className="absolute h-4 w-4 border-[3px] border-[color:var(--fiche-accent)]" />
    </div>
  );
}

/** Cadre de la fiche : fond du thème, liseré doré et losanges aux quatre coins. */
export function SheetFrame({ children, className }: { children: ReactNode; className?: string }) {
  const { variables, presentation } = useSheet();
  const fond = presentation.theme?.fond;
  const image = fond?.type === 'image' ? backgroundImage(fond.source) : undefined;
  const style: CSSProperties = {
    ...variables,
    ...(image
      ? {
          backgroundImage: `url(${image})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
  };

  return (
    <div
      style={style}
      className={cn(
        text,
        'relative mx-auto max-w-5xl rounded-lg bg-[color:var(--fiche-fond)] p-6 font-[family-name:var(--fiche-police-corps)] shadow-2xl sm:p-8 md:p-10',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2 z-20 border-[3px] border-[color:var(--fiche-accent)] sm:inset-4 md:inset-5"
      >
        <Corner className="-left-4 -top-4" />
        <Corner className="-right-4 -top-4" />
        <Corner className="-bottom-4 -left-4" />
        <Corner className="-bottom-4 -right-4" />
      </div>
      <div className="relative z-30">{children}</div>
    </div>
  );
}

/** Carte d'un bloc : petit titre en capitales (avec icône et action) puis contenu. */
export function WidgetCard({
  title,
  icon,
  action,
  children,
  className,
  bare,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Sans fond ni bordure : les cases du contenu portent leur propre cadre. */
  bare?: boolean;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={title ? id : undefined}
      className={cn(bare ? 'p-0' : cn(panel, 'p-2'), 'flex flex-col', className)}
    >
      {(title || action) && (
        <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2 px-0.5">
          {title ? (
            <h2 id={id} className={cn(widgetLabel, 'opacity-80')}>
              {icon}
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Un bloc qui plante disparaît derrière un message, sans emporter la fiche
 * (comme le fond de fiche de l'ancienne app).
 */
export class WidgetBoundary extends Component<
  { title: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Bloc de fiche en erreur :', error);
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={cn(panel, 'p-3 text-xs text-red-300')}>
        Le bloc « {this.props.title} » n&apos;a pas pu s&apos;afficher.
      </div>
    );
  }
}
