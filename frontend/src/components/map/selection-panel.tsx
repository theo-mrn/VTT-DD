'use client';

/**
 * Panneau de la sélection (docs/carte.md § 6) : dès qu'un élément est sélectionné, toutes ses
 * options dans un panneau flottant, posé sur le côté (déplaçable), pas collé à l'élément. Mêmes
 * entrées que le menu du clic droit (`engine.menuItems`) :
 *
 * - les actions principales de la sorte (« Fiche », « Attaquer », « Fouiller ») en boutons ;
 * - les autres en liste lisible, icône et libellé ; un sous-menu (Calque, Visibilité, Vision…)
 *   se déplie sur place ; une case cochée se voit ;
 * - les réglages de l'inspecteur (sections des modules), dépliables ;
 * - « Supprimer » à part, en dernier.
 */
import {
  Check,
  ChevronRight,
  MousePointer2,
  SlidersHorizontal,
  SlidersVertical,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Kbd } from '@/components/ui/kbd';
import type { MenuItem } from '@/lib/map/engine/entities/entity-kind';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { TOKEN_KIND_ID } from '@/lib/map/modules/tokens/edit';
import type { TokenData } from '@/lib/map/modules/tokens/model';
import { cn } from '@/lib/utils';
import {
  useEntities,
  useExtensions,
  useMapEngine,
  useMapState,
  useMapUi,
  useSelectionIds,
} from './engine-context';
import { sameIds } from './inspector';
import { MapPanel } from './map-panel';
import { ResourceEditor } from './tokens/resource-editor';
import { useCharacterInfo, useTokens } from './tokens/use-tokens';

const isSeparator = (i: MenuItem) => i.id.startsWith('sep:');
const isHeading = (i: MenuItem) => i.id.startsWith('label:');

export function SelectionPanel() {
  const engine = useMapEngine();
  const ids = useSelectionIds();
  const entities = useEntities(ids);
  // Les actions dépendent aussi des calques (Calque ▸) et de l'interface (calque actif)
  const layers = useMapState((s) => s.collections.layers);
  const activeLayer = useMapUi((s) => s.activeLayerId);
  const { inspectorSections } = useExtensions();
  // « Inspecter », double clic : les réglages se déplient ici
  const inspecting = useMapUi((s) => s.inspector);

  const items = useMemo(() => {
    if (!entities.length) return [];
    const box = selectionBox(entities);
    return engine.menuItems(
      entities.map((e) => e.id),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    // `layers` et `activeLayer` : recalcul quand les calques changent
  }, [engine, entities, layers, activeLayer]);
  const sections = useMemo(
    () => inspectorSections.filter((s) => entities.length && s.appliesTo(entities, engine.viewer)),
    [inspectorSections, entities, engine],
  );

  const leaves = items.filter((i) => !isSeparator(i));
  const remove = leaves.find((i) => i.id === 'delete') ?? null;
  const primary = leaves.filter((i) => i.primary && i !== remove);
  // « Inspecter » : les réglages sont dans le panneau même
  const rest = tidy(items.filter((i) => !i.primary && i !== remove && i.id !== 'inspect'));
  if (!entities.length || (!leaves.length && !sections.length)) return null;

  const single = entities.length === 1 ? entities[0]! : null;
  const title = single
    ? (single.kind.name?.(single.data, engine.kindContext()) ?? single.kind.label)
    : `${entities.length} éléments`;
  const subtitle = single
    ? single.kind.label
    : [...new Set(entities.map((e) => e.kind.label))].join(', ');
  const thumbnail = single ? (single.kind.thumbnail?.(single.data) ?? null) : null;

  return (
    <MapPanel
      id="selection"
      label={`Sélection : ${title}`}
      icon={MousePointer2}
      title={title}
      subtitle={subtitle}
      media={
        thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            className="size-10 shrink-0 rounded-xl object-cover ring-1 ring-border"
          />
        ) : undefined
      }
      closeLabel="Désélectionner"
      onClose={() => engine.selection.replace([])}
      className="w-72"
    >
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]"
        // Un clic dans le panneau ne part pas à la carte (pas de désélection, pas de pan)
        onPointerDown={(e) => e.stopPropagation()}
      >
        {single && single.kind.id === TOKEN_KIND_ID && (
          <CharacterQuick engine={engine} characterId={(single.data as TokenData).characterId} />
        )}

        {(primary.length > 0 || rest.length > 0) && (
          <ul className="space-y-0.5">
            {primary.map((item) => (
              <ActionRow key={item.id} engine={engine} item={item} depth={0} emphasis />
            ))}
            {primary.length > 0 && rest.length > 0 && (
              <li aria-hidden className="my-1.5 h-px bg-border" />
            )}
            {rest.map((item, n) => (
              <ActionRow key={`${item.id}:${n}`} engine={engine} item={item} depth={0} />
            ))}
          </ul>
        )}

        {sections.length > 0 && (
          <Settings forced={!!inspecting && sameIds(inspecting, ids)}>
            {sections.map((section) => (
              <section key={section.id} aria-label={section.title} className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">
                  {section.title}
                </h3>
                <section.component engine={engine} entities={entities} />
              </section>
            ))}
          </Settings>
        )}

        {remove && (
          <div className="border-t border-border pt-2">
            <ActionRow engine={engine} item={{ ...remove, danger: true }} depth={0} />
          </div>
        )}
      </div>
    </MapPanel>
  );
}

/**
 * Personnage d'un token (MJ, ou le sien) : sa ressource principale modifiable sur place, et ses
 * stats à modifier (la fiche ouverte sur ses valeurs).
 */
function CharacterQuick({ engine, characterId }: { engine: MapEngine; characterId: string }) {
  const tokens = useTokens(engine);
  const info = useCharacterInfo(tokens, characterId);
  const viewer = engine.viewer;
  if (!info) return null;
  const allowed =
    viewer.role === 'gm' ||
    viewer.characterIds.includes(characterId) ||
    info.playedBy === viewer.userId ||
    info.ownerId === viewer.userId;
  if (!allowed) return null;
  const r = info.resource;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2/40 p-2.5">
      {r && (
        <>
          <div className="flex items-baseline justify-between px-0.5 text-xs">
            <span className="font-medium">{r.label}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {r.value} / {r.max}
            </span>
          </div>
          <ResourceEditor characterId={characterId} resource={r} />
        </>
      )}
      <button
        type="button"
        onClick={() => tokens.library.setState({ sheetFor: characterId, sheetValues: true })}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <SlidersVertical className="size-4 text-primary" aria-hidden />
        <span className="flex-1">Modifier les stats</span>
        <ChevronRight className="size-4 text-subtle" aria-hidden />
      </button>
    </div>
  );
}

/** Une entrée : action, case à cocher, sous-menu dépliable, titre ou séparateur. */
function ActionRow({
  engine,
  item,
  depth,
  emphasis = false,
}: {
  engine: MapEngine;
  item: MenuItem;
  depth: number;
  /** Action principale de la sorte : mise en avant sobre (icône d'accent, texte appuyé). */
  emphasis?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (isSeparator(item)) return <li aria-hidden className="my-1.5 h-px bg-border" />;
  if (isHeading(item))
    return (
      <li className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
        {item.label}
      </li>
    );
  const Icon = item.icon;
  const sub = !!item.children?.length;
  const row = cn(
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50',
    item.danger
      ? 'text-destructive hover:bg-destructive/10'
      : emphasis
        ? 'font-medium text-foreground hover:bg-primary/10'
        : 'text-foreground hover:bg-surface-2',
  );
  return (
    <li>
      <button
        type="button"
        disabled={item.disabled}
        aria-expanded={sub ? open : undefined}
        aria-pressed={!sub && item.checked !== undefined ? item.checked : undefined}
        onClick={() => (sub ? setOpen((o) => !o) : run(engine, item))}
        className={row}
        style={depth ? { paddingLeft: `${0.625 + depth * 1.25}rem` } : undefined}
      >
        <span
          className={cn(
            'grid size-4 shrink-0 place-items-center [&_svg]:size-4',
            item.danger ? 'text-destructive' : emphasis ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {item.checked !== undefined && !Icon ? (
            item.checked ? (
              <Check className="text-primary" />
            ) : null
          ) : (
            Icon && <Icon />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.checked && Icon && <Check className="size-3.5 shrink-0 text-primary" />}
        {item.shortcut && <Kbd className="shrink-0">{item.shortcut}</Kbd>}
        {sub && (
          <ChevronRight
            className={cn('size-4 shrink-0 text-subtle transition-transform', open && 'rotate-90')}
            aria-hidden
          />
        )}
      </button>
      <AnimatePresence initial={false}>
        {sub && open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            {item.children!.map((child, n) => (
              <ActionRow key={`${child.id}:${n}`} engine={engine} item={child} depth={depth + 1} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

/** Réglages de l'inspecteur, repliés par défaut. */
function Settings({ children, forced }: { children: React.ReactNode; forced: boolean }) {
  const [open, setOpen] = useState(forced);
  useEffect(() => {
    if (forced) setOpen(true);
  }, [forced]);
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-surface-2"
      >
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
        <span className="flex-1">Réglages</span>
        <ChevronRight
          className={cn('size-4 text-subtle transition-transform', open && 'rotate-90')}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-border p-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Sans séparateur en tête, en fin, ni deux de suite (après les entrées retirées). */
function tidy(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const i of items) {
    if (isSeparator(i) && (!out.length || isSeparator(out[out.length - 1]!))) continue;
    out.push(i);
  }
  while (out.length && isSeparator(out[out.length - 1]!)) out.pop();
  return out;
}

function run(engine: MapEngine, item: MenuItem) {
  item.run?.();
  // Le focus revient à la carte (ses raccourcis restent actifs)
  engine.canvas?.parentElement?.focus({ preventScroll: true });
}

/** Boîte englobante (monde) des entités, aperçus compris. */
function selectionBox(
  entities: readonly { bounds(): { x: number; y: number; width: number; height: number } }[],
) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const e of entities) {
    const b = e.bounds();
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
