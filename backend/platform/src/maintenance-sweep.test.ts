/**
 * Balayage des fichiers orphelins d'un service : désactivé (off, ou stockage, secret, autres
 * services absents), à blanc par défaut (rien supprimé), réel avec `on` ; une seule instance à
 * la fois (verrou consultatif) ; chaque passe journalise son rapport.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryObjectStore } from './storage.js';

const memory = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof import('./storage.js').memoryObjectStore>,
}));
vi.mock('./storage.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./storage.js')>();
  return { ...real, createObjectStore: () => memory.current?.store };
});

import { startOrphanSweep } from './maintenance.js';

const U = '0199a0c3-0000-7000-8000-000000000001';
const OLD = new Date(Date.now() - 72 * 3_600_000);
const ORPHAN = `characters/${U}/${U.replace('1', '2')}.webp`;
const KEPT = `characters/${U}/${U.replace('1', '3')}.webp`;

function pool(lockFree = true) {
  const client = {
    query: vi.fn(async (text: string) => {
      if (text.includes('pg_try_advisory_lock')) return { rows: [{ ok: lockFree }] };
      if (text.includes('information_schema')) return { rows: [{ name: 'characters' }] };
      if (text.includes('regexp')) return { rows: [{ key: KEPT }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return { connect: async () => client, client } as never;
}

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const settings = (o: Record<string, unknown> = {}) => ({
  ORPHAN_SWEEP: 'on' as const,
  ORPHAN_MIN_AGE_HOURS: 24,
  ORPHAN_SWEEP_EVERY_MINUTES: 60,
  INTERNAL_API_SECRET: 's'.repeat(32),
  STORAGE_REFERENCE_URLS: ['http://campaign:3000'],
  ...o,
});

beforeEach(() => {
  vi.useFakeTimers();
  memory.current = memoryObjectStore({ [ORPHAN]: OLD, [KEPT]: OLD });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ referenced: [] }) })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('balayage des fichiers orphelins', () => {
  it('« on » : l’orphelin ancien est supprimé, le fichier cité gardé', async () => {
    const log = logger();
    const stop = startOrphanSweep({
      name: 'character',
      pool: pool(),
      schema: 'characters',
      prefixes: ['characters/'],
      settings: settings(),
      logger: log,
    });
    await vi.advanceTimersByTimeAsync(61_000);
    expect([...memory.current!.objects.keys()]).toEqual([KEPT]);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false }),
      'fichiers orphelins supprimés',
    );
    await stop();
  });

  it('à blanc : rien supprimé, ce qui le serait est journalisé', async () => {
    const log = logger();
    const stop = startOrphanSweep({
      name: 'character',
      pool: pool(),
      schema: 'characters',
      prefixes: ['characters/'],
      settings: settings({ ORPHAN_SWEEP: 'dry-run' }),
      logger: log,
    });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(memory.current!.objects.size).toBe(2);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
      'fichiers orphelins (essai) : rien supprimé',
    );
    await stop();
  });

  it('une autre instance tient le verrou : la passe est sautée', async () => {
    const log = logger();
    const stop = startOrphanSweep({
      name: 'character',
      pool: pool(false),
      schema: 'characters',
      prefixes: ['characters/'],
      settings: settings(),
      logger: log,
    });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(memory.current!.objects.size).toBe(2);
    expect(log.info).not.toHaveBeenCalled();
    await stop();
  });

  it('désactivé : off, ou stockage, secret, autres services absents (avertissement)', async () => {
    const log = logger();
    const base = { name: 'x', pool: pool(), schema: 's', prefixes: ['characters/'], logger: log };
    await startOrphanSweep({ ...base, settings: settings({ ORPHAN_SWEEP: 'off' }) })();
    await startOrphanSweep({ ...base, settings: settings({ INTERNAL_API_SECRET: undefined }) })();
    await startOrphanSweep({ ...base, settings: settings({ STORAGE_REFERENCE_URLS: [] }) })();
    memory.current = null;
    await startOrphanSweep({ ...base, settings: settings() })();
    expect(log.warn).toHaveBeenCalledTimes(3);
  });
});
