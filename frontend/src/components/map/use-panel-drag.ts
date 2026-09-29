'use client';

/**
 * Panneau déplaçable par son en-tête : on le glisse où l'on veut, il reste dans la fenêtre
 * (l'en-tête toujours atteignable), double clic sur l'en-tête pour le remettre en place. Le
 * décalage est gardé par panneau dans ce navigateur. Pendant le glisser, la position est
 * écrite directement dans le DOM (propriété CSS `translate`) : aucun rendu React par
 * mouvement ; l'état n'est mis à jour qu'au lâcher.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

export interface Offset {
  x: number;
  y: number;
}

const ORIGIN: Offset = { x: 0, y: 0 };
/** Marge au bord de la fenêtre, et hauteur d'en-tête qui reste toujours visible. */
const EDGE = 8;
const HEADER = 56;
/** Éléments de l'en-tête qui gardent leur clic (fermer, raccourci…). */
const INTERACTIVE = 'button, a, input, textarea, select, [role="button"], [data-no-drag]';

const storageKey = (id: string) => `vtt:map:panel:${id}`;

function readOffset(id: string): Offset {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(id));
    const v = raw ? (JSON.parse(raw) as Partial<Offset>) : null;
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x!, y: v.y! } : ORIGIN;
  } catch {
    return ORIGIN;
  }
}

function writeOffset(id: string, o: Offset) {
  try {
    if (o.x === 0 && o.y === 0) globalThis.localStorage?.removeItem(storageKey(id));
    else globalThis.localStorage?.setItem(storageKey(id), JSON.stringify(o));
  } catch {
    // Stockage indisponible : la position vaut pour la session
  }
}

/**
 * Borne un décalage pour que le panneau reste dans la fenêtre : horizontalement en entier (s'il
 * y tient), verticalement avec au moins son en-tête visible. `home` : sa place sans décalage.
 */
export function clampOffset(
  o: Offset,
  home: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
): Offset {
  const minX = EDGE - home.left;
  const maxX = Math.max(minX, viewport.width - EDGE - home.width - home.left);
  const minY = EDGE - home.top;
  const maxY = Math.max(minY, viewport.height - EDGE - Math.min(home.height, HEADER) - home.top);
  return {
    x: Math.round(Math.min(maxX, Math.max(minX, o.x))),
    y: Math.round(Math.min(maxY, Math.max(minY, o.y))),
  };
}

export function usePanelDrag<T extends HTMLElement>(id: string) {
  const ref = useRef<T>(null);
  const [offset, setOffset] = useState<Offset>(() => readOffset(id));
  const live = useRef<Offset>(offset);
  const drag = useRef<{ pointer: number; x: number; y: number; from: Offset } | null>(null);
  const [dragging, setDragging] = useState(false);

  const apply = (o: Offset) => {
    live.current = o;
    if (ref.current) ref.current.style.translate = `${o.x}px ${o.y}px`;
  };

  /** Place du panneau sans décalage (sa boîte moins le décalage courant). */
  const home = () => {
    const r = ref.current!.getBoundingClientRect();
    return {
      left: r.left - live.current.x,
      top: r.top - live.current.y,
      width: r.width,
      height: r.height,
    };
  };
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight });

  useLayoutEffect(() => {
    if (!ref.current) return;
    // Revenu dans la fenêtre si elle a rétréci depuis
    apply(clampOffset(offset, home(), viewport()));
  }, [offset]);

  // Fenêtre redimensionnée : le panneau y reste
  useEffect(() => {
    const onResize = () => {
      if (!ref.current || drag.current) return;
      const next = clampOffset(live.current, home(), viewport());
      if (next.x !== live.current.x || next.y !== live.current.y) apply(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const commit = useCallback(
    (o: Offset) => {
      setOffset(o);
      writeOffset(id, o);
    },
    [id],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !ref.current) return;
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, from: live.current };
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId || !ref.current) return;
    const wanted = { x: d.from.x + e.clientX - d.x, y: d.from.y + e.clientY - d.y };
    apply(clampOffset(wanted, home(), viewport()));
  };

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    commit(live.current);
  };

  const reset = (e: ReactMouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    apply(ORIGIN);
    commit(ORIGIN);
  };

  return {
    ref,
    dragging,
    moved: offset.x !== 0 || offset.y !== 0,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onDoubleClick: reset,
    },
  };
}
