// @vitest-environment jsdom
/**
 * Polices des textes : un catalogue sans doublon, rangé par groupes, les polices du système en
 * plus ; une police utilisée est chargée, et son arrivée fait redessiner les textes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTE_FONT_GROUPS, NOTE_FONTS, noteFontOf, systemNoteFont } from './palette';
import { ensureFontLoaded, fontGeneration, onFontsLoaded } from './text-layout';

describe('catalogue des polices', () => {
  it('identifiants et valeurs uniques, chaque police dans un groupe connu', () => {
    expect(NOTE_FONTS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(NOTE_FONTS.map((f) => f.id)).size).toBe(NOTE_FONTS.length);
    expect(new Set(NOTE_FONTS.map((f) => f.value)).size).toBe(NOTE_FONTS.length);
    for (const f of NOTE_FONTS) expect(NOTE_FONT_GROUPS).toContain(f.group);
  });

  it('police du système : trouvée par sa valeur enregistrée, nom nettoyé', () => {
    const orbitron = systemNoteFont('Orbitron');
    expect(orbitron.value).toBe('"Orbitron", var(--font-sans)');
    expect(noteFontOf(orbitron.value, [orbitron])?.label).toBe('Orbitron');
    expect(systemNoteFont('A"b\\c').label).toBe('Abc');
  });
});

describe('chargement des polices', () => {
  const original = Object.getOwnPropertyDescriptor(document, 'fonts');
  afterEach(() => {
    if (original) Object.defineProperty(document, 'fonts', original);
    else delete (document as { fonts?: unknown }).fonts;
  });

  it('une police absente est chargée une fois ; à son arrivée, les textes se refont', async () => {
    let resolve!: (faces: unknown[]) => void;
    const load = vi.fn(() => new Promise<unknown[]>((r) => (resolve = r)));
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { check: () => false, load },
    });
    const listener = vi.fn();
    const off = onFontsLoaded(listener);
    const before = fontGeneration();
    ensureFontLoaded('"Grimoire"');
    ensureFontLoaded('"Grimoire"');
    expect(load).toHaveBeenCalledTimes(1);
    resolve([{}]);
    await Promise.resolve();
    await Promise.resolve();
    expect(fontGeneration()).toBe(before + 1);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('une police déjà là ne se charge pas', () => {
    const load = vi.fn();
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { check: () => true, load },
    });
    ensureFontLoaded('"Lisible"');
    expect(load).not.toHaveBeenCalled();
  });
});
