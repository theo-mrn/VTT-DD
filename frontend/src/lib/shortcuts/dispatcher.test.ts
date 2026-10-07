// @vitest-environment jsdom
/**
 * Aiguilleur : deux passes (tôt, tard), saisie, répétition, touche déjà prise, séquences,
 * commande muette, la dernière montée répond, touche choisie par l'utilisateur.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IS_MAC } from './chord';
import { ShortcutDispatcher } from './dispatcher';
import type { ShortcutDescriptor } from './registry';

let clock = 0;
const make = (resolve?: (d: ShortcutDescriptor) => string | null) =>
  new ShortcutDispatcher(resolve, () => clock);

function press(
  key: string,
  code: string,
  opts: {
    target?: EventTarget | null;
    repeat?: boolean;
    shift?: boolean;
    prevented?: boolean;
  } = {},
) {
  let prevented = Boolean(opts.prevented);
  return {
    key,
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: Boolean(opts.shift),
    repeat: Boolean(opts.repeat),
    target: opts.target ?? null,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
}

const cmd = (id: string, binding: string | null, extra: Partial<ShortcutDescriptor> = {}) =>
  ({
    id,
    label: { text: id },
    scope: 'table',
    defaultBinding: binding,
    ...extra,
  }) satisfies ShortcutDescriptor;

afterEach(() => {
  clock = 0;
});

describe('ShortcutDispatcher', () => {
  it('passe tôt ou tard selon la commande ; la frappe est prise', () => {
    const s = make();
    const tot = vi.fn();
    const tard = vi.fn();
    s.bind(cmd('panneau', 'KeyC'), { run: tot });
    s.bind(cmd('relancer', 'KeyR', { scope: 'dice', late: true }), { run: tard });
    const c = press('c', 'KeyC');
    expect(s.handle(c, 'early')).toBe(true);
    expect(c.defaultPrevented).toBe(true);
    const r = press('r', 'KeyR');
    expect(s.handle(r, 'early')).toBe(false);
    expect(s.handle(r, 'late')).toBe(true);
    expect([tot.mock.calls.length, tard.mock.calls.length]).toEqual([1, 1]);
  });

  it('touche prise en chemin (la carte), répétition, saisie : rien', () => {
    const s = make();
    const run = vi.fn();
    s.bind(cmd('relancer', 'KeyR', { scope: 'dice', late: true }), { run });
    s.handle(press('r', 'KeyR', { prevented: true }), 'late');
    s.handle(press('r', 'KeyR', { repeat: true }), 'late');
    const input = document.createElement('input');
    s.handle(press('r', 'KeyR', { target: input }), 'late');
    expect(run).not.toHaveBeenCalled();
  });

  it('⌘K marche aussi en écrivant (inInput)', () => {
    const s = make();
    const run = vi.fn();
    s.bind(cmd('recherche', 'Mod+KeyK', { scope: 'global', inInput: true }), { run });
    const input = document.createElement('input');
    const e = {
      ...press('k', 'KeyK', { target: input }),
      ...(IS_MAC ? { metaKey: true } : { ctrlKey: true }),
    };
    s.handle(e, 'early');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('séquence : Espace puis Entrée en moins d’une seconde', () => {
    const s = make();
    const run = vi.fn();
    s.bind(cmd('rapide', 'Space Enter', { scope: 'global' }), { run });
    s.handle(press(' ', 'Space'), 'early');
    clock = 500;
    expect(s.handle(press('Enter', 'Enter'), 'early')).toBe(true);
    s.handle(press(' ', 'Space'), 'early');
    clock = 2_000;
    expect(s.handle(press('Enter', 'Enter'), 'early')).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('commande muette ou qui ne fait rien : la frappe continue', () => {
    const s = make();
    s.bind(cmd('fermer', 'Escape'), { run: () => false });
    s.bind(cmd('muette', 'KeyM'), { run: vi.fn(), available: () => false });
    const esc = press('Escape', 'Escape');
    expect(s.handle(esc, 'early')).toBe(false);
    expect(esc.defaultPrevented).toBe(false);
    expect(s.handle(press('m', 'KeyM'), 'early')).toBe(false);
  });

  it('la dernière montée répond, la précédente revient au démontage', () => {
    const s = make();
    const a = vi.fn();
    const b = vi.fn();
    s.bind(cmd('x', 'KeyX'), { run: a });
    const off = s.bind(cmd('x', 'KeyX'), { run: b });
    s.handle(press('x', 'KeyX'), 'early');
    off();
    s.handle(press('x', 'KeyX'), 'early');
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
  });

  it('touche choisie par l’utilisateur ; les commandes de la carte ne passent pas ici', () => {
    const s = make((d) => (d.id === 'chat' ? 'Shift+KeyC' : d.defaultBinding));
    const chat = vi.fn();
    const outil = vi.fn();
    s.bind(cmd('chat', 'KeyC'), { run: chat });
    s.bind(cmd('outil', 'KeyP', { scope: 'map' }), { run: outil });
    s.handle(press('c', 'KeyC'), 'early');
    s.handle(press('C', 'KeyC', { shift: true }), 'early');
    s.handle(press('p', 'KeyP'), 'early');
    expect(chat).toHaveBeenCalledTimes(1);
    expect(outil).not.toHaveBeenCalled();
    expect(s.active().map((d) => d.id)).toEqual(['chat', 'outil']);
  });
});
