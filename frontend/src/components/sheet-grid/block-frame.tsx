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
import type { SheetBlockDefinition, WidgetType } from '@/components/fiche/blocks/types';
import type { ContexteFiche } from '@/components/fiche/widgets';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { GridBlock } from './model';
import type { HeightMode } from './sizing';

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
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3.5">
        {icon && <TriangleAlert className="size-4 text-warning" aria-hidden />}
        <h2 className="min-w-0 truncate text-sm font-semibold text-muted-foreground">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm text-subtle">{children}</div>
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
}: {
  block: GridBlock;
  definition: SheetBlockDefinition;
  ctx: ContexteFiche;
  mode: 'read' | 'edit';
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
        <Bloc ctx={ctx} widget={block.widget as never} mode={mode} />
      </div>
      {vide && (
        <EmptyCard title={block.widget?.titre ?? definition.label}>
          Rien à afficher pour l’instant.
        </EmptyCard>
      )}
    </>
  );
}

export function BlockFrame({
  block,
  ctx,
  editing,
  empty,
  heightMode,
  onMeasure,
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
          />
        </Suspense>
      </BlockBoundary>
    );

  return (
    <div className="relative h-full">
      <div
        ref={mesure}
        className={cn(!auto && 'h-full', editing && 'pointer-events-none select-none')}
        inert={editing}
      >
        {contenu}
      </div>
      {editing && (
        <div
          className={cn(
            'sheet-drag-handle absolute inset-0 z-10 cursor-grab rounded-2xl active:cursor-grabbing',
            'ring-1 ring-primary/30 transition-colors hover:bg-primary/[0.04] hover:ring-primary/60',
          )}
        >
          <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-lg border border-border-strong bg-popover/95 py-0.5 pl-1.5 pr-0.5 text-xs shadow-elevated backdrop-blur">
            <GripVertical className="size-3.5 shrink-0 text-subtle" aria-hidden />
            <span className="min-w-0 truncate font-medium">{titre}</span>
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
  );
}
