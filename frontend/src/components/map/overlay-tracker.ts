/**
 * Placement d'une surcouche DOM qui suit un point de la carte (barre de sélection, mesure,
 * portail) sans re-rendre React et sans lecture de mise en page à chaque image : les tailles de
 * la surcouche et de son hôte sont tenues par un `ResizeObserver`, et le placement n'est refait
 * que si la caméra, la révision du moteur (données, aperçus, direct), une clé propre à
 * l'appelant ou ces tailles ont changé.
 */
import type { MapEngine } from '@/lib/map/engine/map-engine';

export interface OverlaySizes {
  /** Surcouche. */
  w: number;
  h: number;
  /** Hôte (la carte). */
  hostW: number;
  hostH: number;
}

/** Suit `el` dans `host` ; `place` écrit sa position. Renvoie l'arrêt. */
export function trackOverlay(
  engine: MapEngine,
  el: HTMLElement,
  host: HTMLElement,
  place: (sizes: OverlaySizes) => void,
  /** Ce qui, en plus de la caméra et de la révision, change la place (comparé par `===`). */
  extraKey?: () => unknown,
): () => void {
  const sizes: OverlaySizes = { w: 0, h: 0, hostW: 0, hostH: 0 };
  const measure = () => {
    sizes.w = el.offsetWidth;
    sizes.h = el.offsetHeight;
    sizes.hostW = host.clientWidth;
    sizes.hostH = host.clientHeight;
  };
  measure();
  let dirty = true;
  let cx = Number.NaN;
  let cy = Number.NaN;
  let zoom = Number.NaN;
  let vw = Number.NaN;
  let vh = Number.NaN;
  let revision = -1;
  let extra: unknown = undefined;
  const run = () => {
    const cam = engine.camera;
    const key = extraKey?.();
    if (
      !dirty &&
      cam.x === cx &&
      cam.y === cy &&
      cam.zoom === zoom &&
      cam.viewport.width === vw &&
      cam.viewport.height === vh &&
      engine.revision === revision &&
      key === extra
    )
      return;
    dirty = false;
    cx = cam.x;
    cy = cam.y;
    zoom = cam.zoom;
    vw = cam.viewport.width;
    vh = cam.viewport.height;
    revision = engine.revision;
    extra = key;
    place(sizes);
  };
  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          measure();
          dirty = true;
          run();
        })
      : null;
  observer?.observe(el);
  observer?.observe(host);
  run();
  const stop = engine.onFrame(() => void run());
  return () => {
    stop();
    observer?.disconnect();
  };
}
