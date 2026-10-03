/**
 * Boucle du worker, sans base ni ffmpeg : les jobs échus sont traités un par un (span et
 * mesures), une sonnette NOTIFY réveille aussitôt une voie endormie, une connexion LISTEN perdue
 * est reprise, l'entretien supprime les envois abandonnés, et l'arrêt attend les voies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pgFake = vi.hoisted(() => ({
  clients: [] as { handlers: Map<string, (...a: unknown[]) => void>; end: () => Promise<void> }[],
  failConnect: 0,
}));
vi.mock('pg', () => {
  class Client {
    handlers = new Map<string, (...a: unknown[]) => void>();
    constructor() {
      pgFake.clients.push(this);
    }
    async connect() {
      if (pgFake.failConnect > 0) {
        pgFake.failConnect -= 1;
        throw new Error('base injoignable');
      }
    }
    async query() {
      return { rows: [] };
    }
    on(ev: string, fn: (...a: unknown[]) => void) {
      this.handlers.set(ev, fn);
      return this;
    }
    async end() {
      this.handlers.get('end')?.();
    }
  }
  return { default: { Client } };
});
const jobs = vi.hoisted(() => ({
  queue: [] as { id: string; kind: string; assetId: string | null }[],
  run: vi.fn(),
  claim: vi.fn(),
}));
vi.mock('./jobs.js', () => ({
  claimJob: (...a: unknown[]) => jobs.claim(...a),
  runJob: (...a: unknown[]) => jobs.run(...a),
}));

import { drain, maintenance, startWorker } from './loop.js';

const storage = () => ({
  listOlderThan: vi.fn(async () => ['audio/incoming/c/vieux']),
  remove: vi.fn(async () => undefined),
});
const db = () => ({ delete: () => ({ where: async () => undefined }) });
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

beforeEach(() => {
  pgFake.clients.length = 0;
  pgFake.failConnect = 0;
  jobs.queue = [];
  jobs.claim.mockReset().mockImplementation(async () => jobs.queue.shift() ?? null);
  jobs.run.mockReset().mockResolvedValue('done');
});
afterEach(() => vi.useRealTimers());

describe('passage', () => {
  it('traite les jobs échus jusqu’à épuisement (ou la limite)', async () => {
    jobs.queue = [
      { id: 'j1', kind: 'analyze', assetId: 'a1' },
      { id: 'j2', kind: 'purge', assetId: null },
      { id: 'j3', kind: 'analyze', assetId: 'a3' },
    ];
    jobs.run.mockResolvedValueOnce('rejected');
    const deps = { db: db(), storage: storage() } as never;
    expect(await drain(deps, 2)).toBe(2);
    expect(await drain(deps)).toBe(1);
    expect(await drain(deps)).toBe(0);
    expect(jobs.claim).toHaveBeenCalledWith(deps.db ?? expect.anything(), undefined);
  });

  it('entretien : envois abandonnés et effets de plus de 24 h supprimés', async () => {
    const s = storage();
    expect(await maintenance({ db: db(), storage: s } as never, 10 * 86_400_000)).toEqual({
      incoming: 1,
    });
    expect(s.remove).toHaveBeenCalledWith(['audio/incoming/c/vieux']);
    s.listOlderThan.mockResolvedValueOnce([]);
    expect(await maintenance({ db: db(), storage: s } as never)).toEqual({ incoming: 0 });
  });
});

describe('worker', () => {
  it('voies, sonnette NOTIFY, entretien journalisé, arrêt propre', async () => {
    vi.useFakeTimers();
    const log = logger();
    const stop = startWorker({
      db: db(),
      storage: storage(),
      concurrency: 2,
      listenUrl: 'postgres://x',
      logger: log,
    } as never);
    await vi.advanceTimersByTimeAsync(10);
    expect(log.info).toHaveBeenCalledWith({ incoming: 1 }, 'worker : envois abandonnés supprimés');
    // Un job arrive, la sonnette réveille une voie sans attendre le passage suivant
    jobs.queue.push({ id: 'j9', kind: 'analyze', assetId: 'a9' });
    pgFake.clients[0]!.handlers.get('notification')!();
    await vi.advanceTimersByTimeAsync(10);
    expect(jobs.run).toHaveBeenCalledTimes(1);
    // Passage en échec : journalisé, la voie continue
    jobs.claim.mockRejectedValueOnce(new Error('verrou'));
    await vi.advanceTimersByTimeAsync(5_100);
    expect(log.error).toHaveBeenCalledWith({ error: 'verrou' }, 'worker : passage en échec');
    // La sonnette ne réveille qu'une voie : l'autre finit son attente (5 s au plus)
    const stopping = stop();
    await vi.advanceTimersByTimeAsync(5_100);
    await stopping;
  });

  it('LISTEN impossible puis perdu : repris après 2 s ; entretien en échec : signalé', async () => {
    vi.useFakeTimers();
    pgFake.failConnect = 1;
    const log = logger();
    const s = storage();
    s.listOlderThan.mockRejectedValueOnce(new Error('S3'));
    const stop = startWorker({
      db: db(),
      storage: s,
      concurrency: 1,
      listenUrl: 'postgres://x',
      logger: log,
    } as never);
    await vi.advanceTimersByTimeAsync(10);
    expect(log.warn).toHaveBeenCalledWith(
      { error: 'base injoignable' },
      'worker : LISTEN indisponible',
    );
    expect(log.warn).toHaveBeenCalledWith({ error: 'S3' }, 'worker : entretien en échec');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(pgFake.clients).toHaveLength(2);
    pgFake.clients[1]!.handlers.get('error')!();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(pgFake.clients).toHaveLength(3);
    const stopping = stop();
    await vi.advanceTimersByTimeAsync(10);
    await stopping;
  });
});
