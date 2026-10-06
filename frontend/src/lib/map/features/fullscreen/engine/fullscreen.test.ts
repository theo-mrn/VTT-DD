/** Plein écran : support, bascule, suivi des changements, refus du navigateur sans suite. */
import { describe, expect, it, vi } from 'vitest';
import { setup } from '@/lib/map/engine/test-kit';
import { fullscreenFeature } from '../index';
import {
  fullscreenSupported,
  isFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from './fullscreen';

/** Document minimal : l'API Fullscreen, que jsdom n'a pas. */
function fakeDocument(enabled = true) {
  const listeners = new Set<() => void>();
  const doc = {
    fullscreenEnabled: enabled,
    fullscreenElement: null as Element | null,
    documentElement: {} as HTMLElement,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    exitFullscreen: vi.fn(async () => {
      doc.fullscreenElement = null;
      for (const l of listeners) l();
    }),
  };
  doc.documentElement.requestFullscreen = vi.fn(async () => {
    doc.fullscreenElement = doc.documentElement;
    for (const l of listeners) l();
  });
  return { doc: doc as unknown as Document, listeners };
}

describe('plein écran', () => {
  it('support et état', () => {
    expect(fullscreenSupported(fakeDocument(false).doc)).toBe(false);
    expect(fullscreenSupported(undefined)).toBe(false);
    const { doc } = fakeDocument();
    expect(fullscreenSupported(doc)).toBe(true);
    expect(isFullscreen(doc)).toBe(false);
  });

  it('bascule, et prévient à chaque changement', async () => {
    const { doc, listeners } = fakeDocument();
    const changed = vi.fn();
    const off = onFullscreenChange(changed, doc);
    toggleFullscreen(doc);
    await Promise.resolve();
    expect(isFullscreen(doc)).toBe(true);
    toggleFullscreen(doc);
    await Promise.resolve();
    expect(isFullscreen(doc)).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    off();
    expect(listeners.size).toBe(0);
  });

  it('un refus du navigateur ne lève rien', async () => {
    const { doc } = fakeDocument();
    doc.documentElement.requestFullscreen = vi.fn(() => Promise.reject(new Error('refusé')));
    expect(() => toggleFullscreen(doc)).not.toThrow();
    await Promise.resolve();
  });

  it('bouton dans les aides, après Recadrer', () => {
    const t = setup();
    t.engine.use(fullscreenFeature);
    const entry = t.engine.getExtensions().toolbarEntries.find((e) => e.id === 'fullscreen.toggle');
    expect(entry).toMatchObject({ kind: 'action', group: 'assist', order: 40 });
  });
});
