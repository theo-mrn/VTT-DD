'use client';

/**
 * Cadre d'un bloc de la grille : frontière d'erreur (un bloc qui tombe n'emporte pas la
 * fiche), état vide, et en personnalisation la surface de déplacement avec ses commandes.
 * Le bloc lui-même vient du registre (components/fiche/blocks) et ne sait rien de la grille.
 */
import { GripVertical, RotateCw, TriangleAlert, X } from 'lucide-react';
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { blockDefinition } from '@/components/fiche/blocks/registry';
import type { TileArrangement } from '@/components/fiche/blocks/tiles/model';
import type { SheetBlockDefinition, WidgetType } from '@/components/fiche/blocks/types';
import type { ContexteFiche } from '@/components/fiche/widgets';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ArrangementPopover } from './arrangement-popover';
import { MARGIN, type GridBlock, type HeightMode } from './model';

class BlockBoundary extends Component<
  { children: ReactNode; title: string; resetKey: string },
  { error: boolean }
> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `Bloc « ${this.props.title} » : erreur isolée`,
      error.message,
      info.componentStack,
    );
  }

  componentDidUpdate(prev: { resetKey: string }) {
    // Nouvelle fiche ou nouveau réglage : le bloc retente sa chance
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: false });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyCard title={this.props.title} icon>
        <p>Ce bloc n’a pas pu s’afficher. Le reste de la fiche fonctionne toujours.</p>
        <Button
          variant="secondary"
          size="xs"
          className="sheet-no-drag mt-3"
          onClick={() => this.setState({ error: false })}
        >
          <RotateCw />
          Réessayer
        </Button>
      </EmptyCard>
    );
  }
}

/** Bloc sans contenu (vide, illisible ou en erreur), avec le même chrome que les autres. */
function EmptyCard({
  title,
  icon = false,
  children,
}: {
  title: string;
  icon?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-2xl border border-dashed border-border-strong bg-card/60">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        {icon && <TriangleAlert className="size-4 text-warning" aria-hidden />}
        <h2 className="min-w-0 truncate text-[13px] font-semibold text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm text-subtle">{children}</div>
    </section>
  );
}

/**
 * Contenu du bloc ; s'il ne rend rien (aucune donnée à montrer), un état vide prend sa place
 * pour que la case de la grille ne reste pas muette.
 */
function BlockContent({
  block,
  definition,
  ctx,
  mode,
  height,
}: {
  block: GridBlock;
  definition: SheetBlockDefinition;
  ctx: ContexteFiche;
  mode: 'read' | 'edit';
  height: HeightMode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [vide, setVide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const verifier = () => setVide(el.childElementCount === 0);
    verifier();
    const obs = new MutationObserver(verifier);
    obs.observe(el, { childList: true });
    return () => obs.disconnect();
  }, []);
  const Bloc = definition.Component;
  return (
    <>
      <div ref={ref} className={cn('h-full', vide && 'hidden')}>
        <Bloc
          ctx={ctx}
          widget={block.widget as never}
          mode={mode}
          height={height}
          arrangement={definition.tiles ? block.arrangement : undefined}
        />
      </div>
      {vide && (
        <EmptyCard title={block.widget?.titre ?? definition.label}>
          Rien à afficher pour l’instant.
        </EmptyCard>
      )}
    </>
  );
}

const HAUTEURS: [HeightMode, string][] = [
  ['auto', 'Automatique'],
  ['fixed', 'Définie'],
];

/** « Hauteur : Automatique | Définie » : suit le contenu, ou se règle au coin et défile. */
function HeightSwitch({
  title,
  value,
  onChange,
}: {
  title: string;
  value: HeightMode;
  onChange: (mode: HeightMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`Hauteur du bloc ${title}`}
      className="sheet-no-drag ml-1 flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5 text-[11px]"
    >
      <span aria-hidden className="px-1 text-subtle">
        Hauteur
      </span>
      {HAUTEURS.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={value === mode}
          onClick={() => value !== mode && onChange(mode)}
          className={cn(
            'rounded px-1.5 py-0.5 font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
            value === mode
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function BlockFrame({
  block,
  ctx,
  editing,
  empty,
  heightMode,
  onMeasure,
  onHeightModeChange,
  onArrangementChange,
  onRemove,
}: {
  block: GridBlock;
  ctx: ContexteFiche;
  editing: boolean;
  /** Le bloc sait qu'il n'a rien à montrer (caché en lecture, montré en personnalisation). */
  empty: boolean;
  /**
   * `auto` : le contenu garde sa hauteur naturelle, mesurée et remontée par `onMeasure` (la
   * grille en tire la hauteur de la case) ; `fixed` : il remplit la case et défile.
   */
  heightMode: HeightMode;
  onMeasure: (px: number) => void;
  onHeightModeChange: (mode: HeightMode) => void;
  /** Disposition interne d'un bloc de tuiles (undefined : celle de la présentation). */
  onArrangementChange: (arrangement: TileArrangement | undefined) => void;
  onRemove: () => void;
}) {
  const auto = heightMode === 'auto';
  // Hauteur naturelle du contenu : elle ne dépend pas de la case (pas de h-full), donc la
  // mesure ne boucle pas
  const mesure = useRef<HTMLDivElement>(null);
  const onMeasureRef = useRef(onMeasure);
  useEffect(() => {
    onMeasureRef.current = onMeasure;
  }, [onMeasure]);
  useLayoutEffect(() => {
    const el = mesure.current;
    if (!auto || !el) return;
    const obs = new ResizeObserver(() => onMeasureRef.current(el.offsetHeight));
    obs.observe(el);
    return () => obs.disconnect();
  }, [auto]);

  const definition = block.widget
    ? (blockDefinition(block.widget.type as WidgetType) as SheetBlockDefinition)
    : null;
  const titre = block.widget?.titre ?? block.raw.title;
  // Bloc de tuiles : sa disposition interne se règle en personnalisation (deux valeurs au moins)
  const tuiles =
    editing && !empty && definition?.tiles && block.widget
      ? definition.tiles(ctx, block.widget as never)
      : [];
  // En personnalisation, le bloc reste lisible mais sans action (droits d'écriture retirés)
  const ctxBloc = editing ? { ...ctx, operations: undefined } : ctx;

  let contenu: ReactNode;
  if (!definition || !block.widget)
    contenu = (
      <EmptyCard title={titre} icon>
        Ce bloc n’est plus proposé par les règles du personnage. Retirez-le de la fiche.
      </EmptyCard>
    );
  else if (empty)
    contenu = (
      <EmptyCard title={titre}>
        Vide pour l’instant : ce bloc est caché hors personnalisation.
      </EmptyCard>
    );
  else
    contenu = (
      <BlockBoundary
        title={titre}
        resetKey={`${ctx.personnage.id}:${block.id}:${ctx.fiche.etat.systeme.version}`}
      >
        <Suspense fallback={<Skeleton className="h-full min-h-24 rounded-2xl" />}>
          <BlockContent
            block={block}
            definition={definition}
            ctx={ctxBloc}
            mode={editing ? 'edit' : 'read'}
            height={heightMode}
          />
        </Suspense>
      </BlockBoundary>
    );

  // La case de la grille = la carte + la marge basse (espace avec le bloc du dessous). Le
  // cadre de personnalisation épouse la carte, pas la case.
  return (
    <div className="h-full" style={{ paddingBottom: MARGIN }}>
      <div ref={mesure} className={cn('relative', !auto && 'h-full')}>
        <div
          className={cn(!auto && 'h-full', editing && 'pointer-events-none select-none')}
          inert={editing}
        >
          {contenu}
        </div>
        {editing && (
          <div
            className={cn(
              'sheet-drag-handle absolute inset-0 z-10 cursor-grab rounded-2xl active:cursor-grabbing',
              'ring-1 ring-primary/40 transition-colors hover:bg-primary/[0.04] hover:ring-primary/70',
              'group-focus-visible/bloc:ring-2 group-focus-visible/bloc:ring-ring',
            )}
          >
            <div className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-lg border border-border-strong bg-popover/95 py-0.5 pl-1.5 pr-0.5 text-xs shadow-elevated backdrop-blur">
              <GripVertical className="size-3.5 shrink-0 text-subtle" aria-hidden />
              <span className="min-w-0 truncate font-medium">{titre}</span>
              {tuiles.length > 1 && (
                <ArrangementPopover
                  title={titre}
                  tiles={tuiles}
                  value={block.arrangement}
                  onChange={onArrangementChange}
                />
              )}
              <HeightSwitch title={titre} value={heightMode} onChange={onHeightModeChange} />
              <Button
                variant="ghost"
                size="icon-xs"
                className="sheet-no-drag shrink-0"
                onClick={onRemove}
                aria-label={`Retirer le bloc ${titre}`}
                tabIndex={-1}
              >
                <X />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
