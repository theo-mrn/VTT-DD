'use client';

/**
 * Arbre en grille : nœuds placés à leurs coordonnées (`x`, `y`) selon la géométrie `arbres`
 * de la présentation, liens tracés tels que le système les déclare (horizontaux, verticaux ou
 * obliques, dans un sens ou dans les deux). Aucune disposition n'est supposée : seuls les
 * liens déclarés sont dessinés. Zoom (boutons, Ctrl + molette), ajustement au cadre, et
 * défilement ou glisser pour se déplacer.
 */
import type { Presentation } from '@vtt/rules';
import { Check, Lock, Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LinkView, NodeView, TreeView } from './model';

type Geometry = NonNullable<Presentation['arbres']>;

/** Géométrie de repli d'un système qui n'en déclare pas (valeurs d'affichage, pas de jeu). */
const DEFAULT_GEOMETRY: Geometry = {
  colonne: 200,
  ligne: 130,
  noeud: { largeur: 176, hauteur: 64 },
};
const PAD = 16;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
/** Ajustement automatique : jamais en dessous (texte lisible), on défile au-delà. */
const MIN_FIT = 0.6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function linkPath(a: Rect, b: Rect): { x1: number; y1: number; x2: number; y2: number } {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  // Ancrage sur les bords en vis-à-vis : jamais à travers le texte des cases
  if (Math.abs(dx) * a.h >= Math.abs(dy) * a.w) {
    const s = Math.sign(dx) || 1;
    return {
      x1: ca.x + (s * a.w) / 2,
      y1: ca.y + (dy === 0 ? 0 : (dy * (a.w / 2)) / Math.abs(dx || 1)),
      x2: cb.x - (s * b.w) / 2,
      y2: cb.y - (dy === 0 ? 0 : (dy * (b.w / 2)) / Math.abs(dx || 1)),
    };
  }
  const s = Math.sign(dy) || 1;
  return {
    x1: ca.x + (dx === 0 ? 0 : (dx * (a.h / 2)) / Math.abs(dy)),
    y1: ca.y + (s * a.h) / 2,
    x2: cb.x - (dx === 0 ? 0 : (dx * (b.h / 2)) / Math.abs(dy)),
    y2: cb.y - (s * b.h) / 2,
  };
}

const LINK_CLASS: Record<LinkView['state'], string> = {
  owned: 'fill-primary stroke-primary',
  open: 'fill-success/70 stroke-success/70',
  idle: 'fill-border-strong stroke-border-strong',
};

const NODE_CLASS: Record<NodeView['state'], string> = {
  owned: 'border-primary/60 bg-primary/10 shadow-glow',
  available: 'border-success/50 bg-success/5 hover:-translate-y-0.5 hover:border-success',
  blocked: 'border-warning/40 bg-surface-2 hover:border-warning/70',
  locked: 'border-border bg-surface-2/60 opacity-55 hover:opacity-80',
};

export function GridTree({
  view,
  geometry,
  currencyName,
  onSelect,
}: Readonly<{
  view: TreeView;
  geometry: Geometry | undefined;
  currencyName: (id: string | undefined) => string;
  onSelect: (node: NodeView) => void;
}>) {
  const g = geometry ?? DEFAULT_GEOMETRY;
  const width = (view.columns - 1) * g.colonne + g.noeud.largeur + PAD * 2;
  const height = (view.rows - 1) * g.ligne + g.noeud.hauteur + PAD * 2;
  const rect = (n: NodeView): Rect => ({
    x: PAD + (n.x - view.minX) * g.colonne,
    y: PAD + (n.y - view.minY) * g.ligne,
    w: g.noeud.largeur,
    h: g.noeud.hauteur,
  });

  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [auto, setAuto] = useState(true);

  // Tout l'arbre si le cadre le permet sans rendre le texte illisible, sinon la largeur
  const fit = useCallback(() => {
    const el = frame.current;
    if (!el) return;
    const w = (el.clientWidth - 8) / width;
    const h = el.clientHeight > 80 ? (el.clientHeight - 8) / height : 1;
    const z = Math.min(1, Math.min(w, h) >= MIN_FIT ? Math.min(w, h) : w);
    setZoom(Math.max(MIN_FIT, Math.round(z * 100) / 100));
  }, [width, height]);

  // Ajusté au cadre tant que l'utilisateur n'a pas zoomé lui-même (bloc redimensionné…)
  useLayoutEffect(() => {
    if (!auto) return;
    fit();
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [auto, fit]);

  const changeZoom = useCallback((delta: number) => {
    setAuto(false);
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + delta) * 100) / 100)));
  }, []);

  // Ctrl / ⌘ + molette : zoom (écouteur non passif pour bloquer le zoom de la page)
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      changeZoom(e.deltaY > 0 ? -0.1 : 0.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [changeZoom]);

  // Glisser le fond pour se déplacer
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const el = frame.current!;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    frame.current!.scrollLeft = d.left - (e.clientX - d.x);
    frame.current!.scrollTop = d.top - (e.clientY - d.y);
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="relative flex h-full min-h-[12rem] flex-col">
      <div
        ref={frame}
        className="min-h-0 flex-1 cursor-grab overflow-auto rounded-xl border border-border bg-surface/60 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative mx-auto" style={{ width: width * zoom, height: height * zoom }}>
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ width, height, transform: `scale(${zoom})` }}
          >
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              {view.links.map((l) => {
                const p = linkPath(rect(l.from), rect(l.to));
                const angle = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
                const a = 7;
                return (
                  <g key={`${l.from.id}-${l.to.id}`} className={LINK_CLASS[l.state]}>
                    <line
                      x1={p.x1}
                      y1={p.y1}
                      x2={p.x2}
                      y2={p.y2}
                      strokeWidth={l.state === 'owned' ? 3 : 2}
                      strokeLinecap="round"
                      strokeDasharray={l.state === 'open' ? '5 4' : undefined}
                    />
                    {l.oneWay && (
                      <polygon
                        strokeWidth={1}
                        points={[
                          [p.x2, p.y2],
                          [p.x2 - a * Math.cos(angle - 0.45), p.y2 - a * Math.sin(angle - 0.45)],
                          [p.x2 - a * Math.cos(angle + 0.45), p.y2 - a * Math.sin(angle + 0.45)],
                        ]
                          .map((x) => x.join(','))
                          .join(' ')}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
            {view.nodes.map((n) => {
              const r = rect(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelect(n)}
                  title={n.entry.nom}
                  className={cn(
                    'absolute flex flex-col justify-between rounded-lg border px-2.5 py-1.5 text-left transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    NODE_CLASS[n.state],
                  )}
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                >
                  <span
                    className={cn(
                      'line-clamp-2 text-xs font-semibold leading-tight',
                      n.state === 'owned' ? 'text-primary-strong' : 'text-foreground',
                    )}
                  >
                    {n.entry.nom}
                  </span>
                  <span className="flex items-center justify-between gap-1 text-[10px]">
                    {n.state === 'owned' ? (
                      <span className="flex items-center gap-1 text-primary">
                        <Check className="size-3" />
                        {n.entryRank > 1 ? `Rang ${n.entryRank}` : 'Acquis'}
                      </span>
                    ) : n.state === 'locked' ? (
                      <Lock className="size-3 text-subtle" />
                    ) : (
                      <span className={n.state === 'available' ? 'text-success' : 'text-warning'}>
                        {n.state === 'available' ? 'Achetable' : 'Bloqué'}
                      </span>
                    )}
                    {n.cost !== undefined && (
                      <span
                        className="font-mono tabular text-muted-foreground"
                        title={currencyName(n.currency)}
                      >
                        {n.cost}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-strong bg-popover/95 p-0.5 shadow-elevated">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => changeZoom(-0.1)}
            aria-label="Dézoomer"
          >
            <Minus />
          </Button>
          <button
            type="button"
            onClick={() => setAuto(true)}
            className="min-w-11 rounded-md px-1 font-mono text-[11px] tabular text-muted-foreground hover:text-foreground"
            title="Ajuster au cadre"
          >
            {Math.round(zoom * 100)} %
          </button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => changeZoom(0.1)}
            aria-label="Zoomer"
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setAuto(true)}
            aria-label="Ajuster au cadre"
            className={auto ? 'text-primary' : undefined}
          >
            <Maximize2 />
          </Button>
        </div>
      </div>
    </div>
  );
}
