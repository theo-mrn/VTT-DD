import { describe, expect, it } from 'vitest';
import { shortcutCode } from './keyboard';

describe('shortcutCode', () => {
  it('une lettre : celle que la touche tape (AZERTY comme QWERTY)', () => {
    // AZERTY : la touche marquée A est à la place du Q américain, Z à celle du W
    expect(shortcutCode({ key: 'a', code: 'KeyQ' })).toBe('KeyA');
    expect(shortcutCode({ key: 'z', code: 'KeyW' })).toBe('KeyZ');
    expect(shortcutCode({ key: 'w', code: 'KeyZ' })).toBe('KeyW');
    // ⇧ ou ⌘⇧ : majuscule, même raccourci
    expect(shortcutCode({ key: 'Z', code: 'KeyW' })).toBe('KeyZ');
    // M en AZERTY : à la place du point-virgule américain
    expect(shortcutCode({ key: 'm', code: 'Semicolon' })).toBe('KeyM');
  });

  it('le reste : la position (chiffres sans ⇧ en AZERTY, pavé numérique, Espace)', () => {
    expect(shortcutCode({ key: '&', code: 'Digit1' })).toBe('Digit1');
    expect(shortcutCode({ key: '3', code: 'Numpad3' })).toBe('Numpad3');
    expect(shortcutCode({ key: ' ', code: 'Space' })).toBe('Space');
    expect(shortcutCode({ key: 'ArrowUp', code: 'ArrowUp' })).toBe('ArrowUp');
    // ⌥ sur Mac : caractère spécial, la position fait foi
    expect(shortcutCode({ key: '®', code: 'KeyR' })).toBe('KeyR');
  });
});
