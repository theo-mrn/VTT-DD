/** Touches : lecture d'une frappe (AZERTY, symboles, ⌥), validation, conflits, affichage. */
import { describe, expect, it } from 'vitest';
import {
  bindingAria,
  bindingLabel,
  bindingsClash,
  chordFromEvent,
  isChord,
  parseBinding,
  type KeyLike,
} from './chord';

const key = (key: string, code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('chordFromEvent', () => {
  it('lettre tapée (AZERTY : la touche A donne KeyA), chiffres par position', () => {
    expect(chordFromEvent(key('a', 'KeyQ'))).toBe('KeyA');
    expect(chordFromEvent(key('N', 'KeyN', { shiftKey: true }))).toBe('Shift+KeyN');
    expect(chordFromEvent(key('&', 'Digit1'))).toBe('Digit1');
    expect(chordFromEvent(key('1', 'Numpad1'))).toBe('Digit1');
  });

  it('⌘ sur Mac, Ctrl ailleurs ; Contrôle à part sur Mac', () => {
    expect(chordFromEvent(key('k', 'KeyK', { metaKey: true }), true)).toBe('Mod+KeyK');
    expect(chordFromEvent(key('k', 'KeyK', { ctrlKey: true }), false)).toBe('Mod+KeyK');
    expect(chordFromEvent(key('k', 'KeyK', { ctrlKey: true }), true)).toBe('Ctrl+KeyK');
  });

  it('symbole : le caractère, sans ⇧ ; ⌥ garde la position de la lettre', () => {
    expect(chordFromEvent(key('?', 'Comma', { shiftKey: true }))).toBe('Char:?');
    expect(chordFromEvent(key('+', 'Equal', { shiftKey: true }))).toBe('Char:+');
    expect(chordFromEvent(key('π', 'KeyP', { altKey: true }))).toBe('Alt+KeyP');
    expect(chordFromEvent(key('˜', 'KeyN', { altKey: true, metaKey: true }), true)).toBe(
      'Mod+Alt+KeyN',
    );
  });

  it('touches nommées ; modificateur seul : rien', () => {
    expect(chordFromEvent(key(' ', 'Space'))).toBe('Space');
    expect(chordFromEvent(key('Escape', 'Escape'))).toBe('Escape');
    expect(chordFromEvent(key('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull();
  });
});

describe('raccourcis', () => {
  it('validation : ordre des modificateurs, séquences de 3 au plus', () => {
    expect(isChord('Mod+Shift+KeyK')).toBe(true);
    expect(isChord('Shift+Mod+KeyK')).toBe(false);
    expect(isChord('Mod+Char:+')).toBe(true);
    expect(isChord('Shift')).toBe(false);
    expect(parseBinding('Space Enter')).toEqual(['Space', 'Enter']);
    expect(parseBinding('KeyA KeyB KeyC KeyD')).toBeNull();
    expect(parseBinding('')).toBeNull();
  });

  it('conflit : identiques, ou l’un commence l’autre', () => {
    expect(bindingsClash('KeyK', 'KeyK')).toBe(true);
    expect(bindingsClash('Space', 'Space Enter')).toBe(true);
    expect(bindingsClash('Space Enter', 'Enter')).toBe(false);
    expect(bindingsClash('KeyK', 'Shift+KeyK')).toBe(false);
  });

  it('affichage et aria', () => {
    expect(bindingLabel('Mod+KeyK', true)).toBe('⌘K');
    expect(bindingLabel('Mod+KeyK', false)).toBe('Ctrl+K');
    expect(bindingLabel('Shift+KeyN', false)).toBe('⇧N');
    expect(bindingLabel('Space Enter', false)).toBe('Espace Entrée');
    expect(bindingLabel('Char:?', false)).toBe('?');
    expect(bindingLabel(null)).toBeNull();
    expect(bindingAria('Mod+KeyK', true)).toBe('Meta+K');
    expect(bindingAria('Shift+KeyN', false)).toBe('Shift+N');
  });
});
