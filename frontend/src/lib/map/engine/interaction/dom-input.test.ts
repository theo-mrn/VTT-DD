// @vitest-environment jsdom
/**
 * Branchement du DOM : pointeurs normalisés (repère local, monde, type), focus et capture au
 * clic, survol effacé à la sortie, molette et pincement Safari, clavier hors saisie, Échap
 * pendant un geste pris en capture, et tout retiré au débranchement.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapEngine } from '../map-engine';
import type { MapKey, MapPointer } from '../tools/tool';
import { bindDomInput, isTyping } from './dom-input';

function fakeEngine() {
  const controller = {
    busy: false,
    pointerDown: vi.fn((_p: MapPointer) => true),
    pointerMove: vi.fn((_p: MapPointer) => undefined),
    pointerUp: vi.fn((_p: MapPointer) => undefined),
    pointerCancel: vi.fn((_p: MapPointer) => undefined),
    wheel: vi.fn(),
    keyDown: vi.fn((_k: MapKey) => true),
    keyUp: vi.fn((_k: MapKey) => undefined),
    blur: vi.fn(),
  };
  const engine = {
    controller,
    camera: {
      screenToWorld: (p: { x: number; y: number }) => ({ x: p.x * 2, y: p.y * 2 }),
      zoomAt: vi.fn(),
    },
    cameraSettled: vi.fn(),
    setHovered: vi.fn(),
  };
  return { engine: engine as unknown as MapEngine, controller, raw: engine };
}

/** Événement avec les champs voulus (jsdom n'a pas toujours `PointerEvent`). */
function ev<T extends Event>(type: string, props: Record<string, unknown> = {}, init = {}): T {
  const e = new Event(type, { bubbles: true, cancelable: true, ...init });
  for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });
  return e as T;
}

const pointer = (type: string, extra: Record<string, unknown> = {}) =>
  ev<PointerEvent>(type, {
    pointerId: 7,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    clientX: 110,
    clientY: 60,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    timeStamp: 42,
    ...extra,
  });

let el: HTMLDivElement;
let unbind: () => void;
let f: ReturnType<typeof fakeEngine>;

beforeEach(() => {
  el = document.createElement('div');
  el.tabIndex = 0;
  el.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
  const captured = new Set<number>();
  Object.assign(el, {
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  });
  document.body.appendChild(el);
  f = fakeEngine();
  unbind = bindDomInput(f.engine, el);
});
afterEach(() => {
  unbind();
  el.remove();
});

describe('saisie en cours', () => {
  it('champ, éditeur, menu : la carte se tait', () => {
    const input = document.createElement('input');
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('span');
    menu.appendChild(item);
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    expect(isTyping(input)).toBe(true);
    expect(isTyping(item)).toBe(true);
    expect(isTyping(editable)).toBe(true);
    expect(isTyping(document.createElement('div'))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe('pointeur', () => {
  it('appui : repère local et monde, focus, capture, défaut empêché', () => {
    const down = pointer('pointerdown', { pointerType: 'pen', shiftKey: true });
    el.dispatchEvent(down);
    const p = f.controller.pointerDown.mock.calls[0]![0];
    expect(p).toMatchObject({
      id: 7,
      type: 'pen',
      button: 0,
      screen: { x: 100, y: 40 },
      world: { x: 200, y: 80 },
      shift: true,
      time: 42,
    });
    expect(document.activeElement).toBe(el);
    expect((el as unknown as { hasPointerCapture(id: number): boolean }).hasPointerCapture(7)).toBe(
      true,
    );
    expect(down.defaultPrevented).toBe(true);
  });

  it('appui sur un autre élément que la carte (panneau posé dessus) : ignoré', () => {
    const child = document.createElement('button');
    el.appendChild(child);
    child.dispatchEvent(pointer('pointerdown'));
    expect(f.controller.pointerDown).not.toHaveBeenCalled();
  });

  it('mouvement sans bouton, lâcher (capture rendue), annulation ; doigt et souris', () => {
    el.dispatchEvent(pointer('pointerdown', { pointerType: 'touch' }));
    expect(f.controller.pointerDown.mock.calls[0]![0].type).toBe('touch');
    el.dispatchEvent(pointer('pointermove', { pointerType: 'other' }));
    expect(f.controller.pointerMove.mock.calls[0]![0]).toMatchObject({ button: -1, type: 'mouse' });
    el.dispatchEvent(pointer('pointerup', { button: 2, buttons: 0 }));
    expect(f.controller.pointerUp.mock.calls[0]![0].button).toBe(2);
    expect((el as unknown as { hasPointerCapture(id: number): boolean }).hasPointerCapture(7)).toBe(
      false,
    );
    el.dispatchEvent(pointer('pointercancel'));
    expect(f.controller.pointerCancel).toHaveBeenCalledTimes(1);
  });

  it('la place de la carte est gardée en cache, relue à l’entrée du pointeur', () => {
    el.dispatchEvent(pointer('pointermove'));
    el.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    el.dispatchEvent(pointer('pointermove'));
    expect(f.controller.pointerMove.mock.calls[1]![0].screen).toEqual({ x: 100, y: 40 });
    el.dispatchEvent(new Event('pointerenter'));
    el.dispatchEvent(pointer('pointermove'));
    expect(f.controller.pointerMove.mock.calls[2]![0].screen).toEqual({ x: 110, y: 60 });
  });

  it('sortie sans bouton : le survol s’efface ; pendant un geste : rien', () => {
    el.dispatchEvent(pointer('pointerleave', { buttons: 0 }));
    expect(f.raw.setHovered).toHaveBeenCalledWith(null);
    f.raw.setHovered.mockClear();
    f.controller.busy = true;
    el.dispatchEvent(pointer('pointerleave', { buttons: 0 }));
    el.dispatchEvent(pointer('pointerleave', { buttons: 1 }));
    expect(f.raw.setHovered).not.toHaveBeenCalled();
  });

  it('menu contextuel du navigateur empêché', () => {
    const e = ev('contextmenu');
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

describe('molette et pincement', () => {
  it('molette : repère local, delta, mode, ctrl (pincement des autres navigateurs)', () => {
    const e = ev<WheelEvent>('wheel', {
      clientX: 60,
      clientY: 70,
      deltaY: -120,
      deltaMode: 0,
      ctrlKey: true,
    });
    el.dispatchEvent(e);
    expect(f.controller.wheel).toHaveBeenCalledWith({ x: 50, y: 50 }, -120, 0, true);
    expect(e.defaultPrevented).toBe(true);
  });

  it('pincement Safari : zoom relatif à l’échelle précédente, caméra posée', () => {
    el.dispatchEvent(ev('gesturestart'));
    el.dispatchEvent(ev('gesturechange', { scale: 2, clientX: 10, clientY: 20 }));
    el.dispatchEvent(ev('gesturechange', { scale: 3, clientX: 10, clientY: 20 }));
    el.dispatchEvent(ev('gesturechange', { scale: 0, clientX: 10, clientY: 20 }));
    expect(f.raw.camera.zoomAt.mock.calls).toEqual([
      [{ x: 0, y: 0 }, 2],
      [{ x: 0, y: 0 }, 1.5],
    ]);
    expect(f.raw.cameraSettled).toHaveBeenCalledTimes(2);
  });
});

describe('clavier', () => {
  const key = (type: string, k: string, extra: Record<string, unknown> = {}) =>
    new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true, ...extra });

  it('touche sur la carte : transmise (lettre tapée), défaut empêché si prise', () => {
    const e = key('keydown', 'a', { code: 'KeyQ', shiftKey: true });
    el.dispatchEvent(e);
    expect(f.controller.keyDown.mock.calls[0]![0]).toMatchObject({ key: 'a', shift: true });
    expect(e.defaultPrevented).toBe(true);
    el.dispatchEvent(key('keyup', 'a'));
    expect(f.controller.keyUp).toHaveBeenCalledTimes(1);
  });

  it('pendant une saisie, ou déjà traitée : rien', () => {
    const input = document.createElement('input');
    el.appendChild(input);
    input.dispatchEvent(key('keydown', 'a'));
    const handled = key('keydown', 'b');
    handled.preventDefault();
    el.dispatchEvent(handled);
    expect(f.controller.keyDown).not.toHaveBeenCalled();
  });

  it('perte du focus : le contrôleur relâche tout', () => {
    el.dispatchEvent(new FocusEvent('blur'));
    expect(f.controller.blur).toHaveBeenCalledTimes(1);
  });

  it('Échap pendant un geste, carte au focus : pris en capture avant les panneaux', () => {
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    el.focus();
    f.controller.busy = true;
    window.dispatchEvent(key('keydown', 'Escape'));
    expect(f.controller.keyDown).toHaveBeenCalledTimes(1);
    // Hors geste, autre touche ou carte sans focus : la fenêtre laisse passer
    f.controller.busy = false;
    window.dispatchEvent(key('keydown', 'Escape'));
    f.controller.busy = true;
    window.dispatchEvent(key('keydown', 'a'));
    el.blur();
    window.dispatchEvent(key('keydown', 'Escape'));
    expect(f.controller.keyDown).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', outside);
  });
});

describe('débranchement', () => {
  it('plus rien n’arrive au contrôleur', () => {
    unbind();
    el.dispatchEvent(pointer('pointerdown'));
    el.dispatchEvent(pointer('pointermove'));
    el.dispatchEvent(ev('wheel', { clientX: 0, clientY: 0, deltaY: 1, deltaMode: 0 }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(f.controller.pointerDown).not.toHaveBeenCalled();
    expect(f.controller.pointerMove).not.toHaveBeenCalled();
    expect(f.controller.wheel).not.toHaveBeenCalled();
    expect(f.controller.keyDown).not.toHaveBeenCalled();
    unbind = () => undefined;
  });
});
