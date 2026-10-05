import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Faux stockage local : environnement Node, le module lit `window.localStorage`. */
function fakeWindow(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  return store;
}

async function load() {
  vi.resetModules();
  return import('./youtube');
}

const settled = (p: Promise<void>) =>
  Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), 10))]);

describe('consentement YouTube', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('sans choix : le lecteur attend et le bandeau est demandé', async () => {
    fakeWindow();
    const c = await load();
    expect(c.youtubeConsentNeeded()).toBe(false);
    const wait = c.whenYoutubeAllowed();
    expect(c.youtubeConsentNeeded()).toBe(true);
    expect(await settled(wait)).toBe(false);
  });

  it('accord : les lecteurs en attente partent, le choix est gardé', async () => {
    const store = fakeWindow();
    const c = await load();
    const wait = c.whenYoutubeAllowed();
    c.setYoutubeConsent('granted');
    expect(await settled(wait)).toBe(true);
    expect(c.youtubeConsentNeeded()).toBe(false);
    expect(store.get('yner:consent:youtube')).toBe('granted');
  });

  it('refus : rien ne se charge, sans redemander', async () => {
    fakeWindow({ 'yner:consent:youtube': 'denied' });
    const c = await load();
    const wait = c.whenYoutubeAllowed();
    expect(c.youtubeConsentNeeded()).toBe(false);
    expect(await settled(wait)).toBe(false);
    c.setYoutubeConsent('granted');
    expect(await settled(wait)).toBe(true);
  });

  it('accord déjà donné : aucune attente', async () => {
    fakeWindow({ 'yner:consent:youtube': 'granted' });
    const c = await load();
    expect(await settled(c.whenYoutubeAllowed())).toBe(true);
  });
});
