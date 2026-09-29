/**
 * Branchement du DOM sur le contrôleur d'interaction : pointeur (souris, stylet, doigts),
 * molette, pincement Safari, clavier. Le seul fichier du moteur qui écoute le navigateur ;
 * le contrôleur, lui, ne reçoit que des événements normalisés.
 *
 * Clavier : seulement quand la carte a le focus (elle le prend au clic), jamais pendant la
 * saisie. Les raccourcis de panneaux de la table (écoutés en capture sur le document) passent
 * avant ; seul Échap pendant un geste de la carte est pris plus tôt (capture sur la fenêtre),
 * pour annuler le geste plutôt que fermer un panneau.
 */
import { shortcutCode } from '@/lib/keyboard';
import type { MapEngine } from '../map-engine';
import type { MapKey, MapPointer } from '../tools/tool';

/** Frappe dans un champ, un éditeur, un menu : la carte se tait. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"]',
    ) !== null
  );
}

const toKey = (e: KeyboardEvent): MapKey => ({
  key: e.key,
  // Lettre tapée plutôt que position (AZERTY : la touche A pose des personnages, ⌘Z annule)
  code: shortcutCode(e),
  shift: e.shiftKey,
  alt: e.altKey,
  ctrl: e.ctrlKey,
  meta: e.metaKey,
  repeat: e.repeat,
});

/** Événement de pincement de Safari (non typé par le DOM). */
interface GestureLike extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

export function bindDomInput(engine: MapEngine, el: HTMLElement): () => void {
  const controller = engine.controller;

  const local = (clientX: number, clientY: number) => {
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const toPointer = (e: PointerEvent, button: number): MapPointer => {
    const screen = local(e.clientX, e.clientY);
    const type = e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
    return {
      id: e.pointerId,
      type,
      button,
      buttons: e.buttons,
      screen,
      world: engine.camera.screenToWorld(screen),
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      time: e.timeStamp,
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.target !== el && !(e.target instanceof HTMLCanvasElement)) return;
    el.focus({ preventScroll: true });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà relâché
    }
    if (controller.pointerDown(toPointer(e, e.button))) e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent) => controller.pointerMove(toPointer(e, -1));
  const onPointerUp = (e: PointerEvent) => {
    controller.pointerUp(toPointer(e, e.button));
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  const onPointerCancel = (e: PointerEvent) => controller.pointerCancel(toPointer(e, e.button));
  const onPointerLeave = (e: PointerEvent) => {
    // Le survol s'efface quand le pointeur quitte la carte (sans bouton pressé)
    if (e.buttons === 0 && !controller.busy) engine.setHovered(null);
  };
  const onContextMenu = (e: MouseEvent) => e.preventDefault();

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    controller.wheel(local(e.clientX, e.clientY), e.deltaY, e.deltaMode, e.ctrlKey);
  };

  // Pincement du pavé tactile sous Safari (les autres navigateurs envoient molette + ctrlKey)
  let gestureScale = 1;
  const onGestureStart = (e: Event) => {
    e.preventDefault();
    gestureScale = 1;
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    const g = e as GestureLike;
    if (!g.scale) return;
    engine.camera.zoomAt(local(g.clientX, g.clientY), g.scale / gestureScale);
    gestureScale = g.scale;
    engine.cameraSettled();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || isTyping(e.target)) return;
    if (controller.keyDown(toKey(e))) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => controller.keyUp(toKey(e));
  const onBlur = () => controller.blur();

  /** Échap pendant un geste de la carte : annule le geste avant tout autre raccourci. */
  const onWindowKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !controller.busy || document.activeElement !== el) return;
    if (controller.keyDown(toKey(e))) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerCancel);
  el.addEventListener('pointerleave', onPointerLeave);
  el.addEventListener('contextmenu', onContextMenu);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('gesturestart', onGestureStart);
  el.addEventListener('gesturechange', onGestureChange);
  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('keyup', onKeyUp);
  el.addEventListener('blur', onBlur);
  window.addEventListener('keydown', onWindowKeyDown, { capture: true });

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerCancel);
    el.removeEventListener('pointerleave', onPointerLeave);
    el.removeEventListener('contextmenu', onContextMenu);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('gesturestart', onGestureStart);
    el.removeEventListener('gesturechange', onGestureChange);
    el.removeEventListener('keydown', onKeyDown);
    el.removeEventListener('keyup', onKeyUp);
    el.removeEventListener('blur', onBlur);
    window.removeEventListener('keydown', onWindowKeyDown, { capture: true });
  };
}
