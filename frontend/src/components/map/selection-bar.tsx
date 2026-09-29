'use client';

/**
 * Barre d'actions de la sélection (docs/carte.md § 6) : dès qu'un élément est sélectionné, ses
 * actions apparaissent au-dessus de lui. Mêmes entrées que le menu du clic droit
 * (`engine.menuItems`), pour tous les éléments : l'action principale de la sorte en bouton
 * libellé (« Fouiller », « Fiche »), les actions à icône en boutons, les sous-menus (Ordre,
 * Calque, Visibilité…) en listes, tout le menu sous « … », et « Supprimer » à part, en dernier.
 *
 * Elle suit la sélection sans re-rendre React : sa position est écrite dans le DOM à chaque
 * image du moteur. Elle s'efface pendant un geste (glisser, lasso, pan) et quand le menu du
 * clic droit est ouvert.
 */
import { MoreHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import type { MenuItem } from '@/lib/map/engine/entities/entity-kind';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { cn } from '@/lib/utils';
import { MenuItems } from './context-menu';
import {
  useEntities,
  useMapEngine,
  useMapState,
  useMapUi,
  useSelectionIds,
} from './engine-context';

/** Boutons à icône au plus ; le reste est sous « … ». */
const MAX_QUICK = 6;
/** Écart entre la barre et la sélection, et marge au bord de la carte (pixels d'écran). */
const GAP = 12;
const EDGE = 8;

interface BarLayout {
  primary: MenuItem[];
  quick: MenuItem[];
  remove: MenuItem | null;
  all: MenuItem[];
}

/**
 * Répartit les entrées du menu dans la barre (l'ordre du menu est gardé). Un joueur n'a que les
 * actions marquées pour lui (`forPlayers` : « Fouiller »), sans « … » ni « Supprimer » : il
 * clique sans cesse son token pour le déplacer, ses autres actions restent au clic droit.
 */
export function barLayout(items: readonly MenuItem[], gm = true): BarLayout {
  const leaves = items.filter((i) => !i.id.startsWith('sep:') && !i.id.startsWith('label:'));
  if (!gm) return { primary: leaves.filter((i) => i.forPlayers), quick: [], remove: null, all: [] };
  const remove = leaves.find((i) => i.id === 'delete') ?? null;
  const primary = leaves.filter((i) => i.primary && i !== remove);
  const quick = leaves
    .filter((i) => !i.primary && i !== remove && i.icon && (i.run || i.children?.length))
    .slice(0, MAX_QUICK);
  return { primary, quick, remove, all: [...items] };
}

const tip = (i: MenuItem) => (i.shortcut ? `${i.label} (${i.shortcut})` : i.label);

export function SelectionBar({ hostRef }: { hostRef: RefObject<HTMLElement | null> }) {
  const engine = useMapEngine();
  const ids = useSelectionIds();
  const entities = useEntities(ids);
  const menuOpen = useMapUi((s) => s.menu !== null);
  // Les actions dépendent aussi des calques (Calque ▸) et de l'interface (calque actif)
  const layers = useMapState((s) => s.collections.layers);
  const activeLayer = useMapUi((s) => s.activeLayerId);
  const barRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    if (!entities.length) return null;
    const center = selectionBox(entities);
    const items = engine.menuItems(
      entities.map((e) => e.id),
      { x: center.x + center.width / 2, y: center.y + center.height / 2 },
    );
    const l = barLayout(items, engine.viewer.role === 'gm');
    return l.primary.length || l.quick.length || l.remove || l.all.length ? l : null;
    // `layers` et `activeLayer` : recalcul quand les calques changent
  }, [engine, entities, layers, activeLayer]);

  const shown = !!layout && !menuOpen;

  // Position : au-dessus de la sélection (en dessous s'il n'y a pas la place), dans la carte
  useEffect(() => {
    if (!shown) return;
    let last = '';
    const place = () => {
      const el = barRef.current;
      const host = hostRef.current;
      if (!el || !host) return;
      const selected = engine.selectedEntities();
      const busy =
        engine.controller.busy || selected.some((e) => e.state.dragging || !e.display?.visible);
      if (!selected.length || busy) {
        if (last !== 'hidden') el.style.visibility = 'hidden';
        last = 'hidden';
        return;
      }
      const box = selectionBox(selected);
      const top = engine.camera.worldToScreen({ x: box.x + box.width / 2, y: box.y });
      const bottom = engine.camera.worldToScreen({ x: box.x, y: box.y + box.height });
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const maxX = host.clientWidth - w - EDGE;
      const x = Math.round(Math.min(Math.max(top.x - w / 2, EDGE), Math.max(EDGE, maxX)));
      // La barre d'outils et le bandeau occupent le haut : en dessous si ça ne tient pas
      let y = top.y - GAP - h;
      if (y < 64) y = bottom.y + GAP;
      y = Math.round(Math.min(Math.max(y, EDGE), host.clientHeight - h - EDGE));
      const key = `${x}:${y}`;
      if (key === last) return;
      if (last === 'hidden' || last === '') el.style.visibility = 'visible';
      last = key;
      el.style.transform = `translate(${x}px, ${y}px)`;
    };
    place();
    return engine.onFrame(() => {
      place();
    });
  }, [engine, hostRef, shown, ids]);

  const container = hostRef.current?.parentElement;
  if (!shown || !layout || !container) return null;

  const run = (item: MenuItem) => {
    item.run?.();
    focusMap(engine);
  };

  return createPortal(
    <div
      ref={barRef}
      role="toolbar"
      aria-label={barLabel(entities.length, engine)}
      className="pointer-events-auto absolute left-0 top-0 z-20 flex items-center gap-0.5 rounded-xl border border-border bg-background/95 p-1 shadow-elevated backdrop-blur-md"
      style={{ visibility: 'hidden' }}
      // Un clic sur la barre ne part pas à la carte (pas de désélection, pas de pan)
      onPointerDown={(e) => e.stopPropagation()}
    >
      {layout.primary.map((item) => (
        <Button
          key={item.id}
          size="sm"
          disabled={item.disabled}
          onClick={() => run(item)}
          className="h-8"
        >
          {item.icon && <item.icon />}
          {item.label}
        </Button>
      ))}
      {layout.primary.length > 0 && layout.quick.length > 0 && <Divider />}

      {layout.quick.map((item) =>
        item.children?.length ? (
          <DropdownMenu key={item.id}>
            <Info texte={item.label}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={item.label}
                  disabled={item.disabled}
                >
                  {item.icon && <item.icon />}
                </Button>
              </DropdownMenuTrigger>
            </Info>
            <DropdownMenuContent
              side="top"
              align="start"
              className="max-h-80 w-56 overflow-y-auto"
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                focusMap(engine);
              }}
            >
              <MenuItems items={item.children} />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Info key={item.id} texte={tip(item)}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={item.label}
              aria-pressed={item.checked}
              disabled={item.disabled}
              onClick={() => run(item)}
              className={cn(item.checked && 'bg-primary/15 text-primary')}
            >
              {item.icon && <item.icon />}
            </Button>
          </Info>
        ),
      )}

      {layout.all.length > 0 && (
        <DropdownMenu>
          <Info texte="Toutes les actions">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Toutes les actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
          </Info>
          <DropdownMenuContent
            side="top"
            align="end"
            className="max-h-96 w-60 overflow-y-auto"
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              focusMap(engine);
            }}
          >
            <MenuItems items={layout.all} />
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {layout.remove && (
        <>
          <Divider />
          <Info texte={tip(layout.remove)}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={layout.remove.label}
              disabled={layout.remove.disabled}
              onClick={() => run(layout.remove!)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {layout.remove.icon && <layout.remove.icon />}
            </Button>
          </Info>
        </>
      )}
    </div>,
    container,
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
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

function barLabel(count: number, engine: MapEngine) {
  if (count !== 1) return `Actions des ${count} éléments sélectionnés`;
  const e = engine.selectedEntities()[0];
  const name = e ? (e.kind.name?.(e.data, engine.kindContext()) ?? e.kind.label) : 'l’élément';
  return `Actions de ${name}`;
}

/** Le focus revient à la carte (ses raccourcis restent actifs). */
function focusMap(engine: MapEngine) {
  engine.canvas?.parentElement?.focus({ preventScroll: true });
}
