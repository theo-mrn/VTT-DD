/**
 * Bus d'identity : le démarrage n'attend pas NATS ; connexion retentée avec un délai croissant ;
 * relais d'outbox et consommateur des titres sur la même connexion ; un consommateur qui ne
 * démarre pas est retenté ; l'arrêt referme tout, même pendant une tentative.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  connect: vi.fn(),
  relay: vi.fn(),
  titles: vi.fn(),
  rights: vi.fn(),
  close: vi.fn(async () => undefined),
  stopRelay: vi.fn(async () => undefined),
  stopTitles: vi.fn(async () => undefined),
  stopRights: vi.fn(async () => undefined),
}));

vi.mock('@vtt/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vtt/platform')>()),
  connectBus: fakes.connect,
  startOutboxRelay: fakes.relay,
}));
vi.mock('./modules/titres/consumer.js', () => ({ startTitlesConsumer: fakes.titles }));
vi.mock('./modules/premium/index.js', () => ({
  RIGHTS_CONSUMER: 'identity-rights',
  startRightsConsumer: fakes.rights,
}));

import { startIdentityBus } from './bus.js';

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const start = (log = logger()) => ({
  log,
  stop: startIdentityBus({
    natsUrl: 'nats://x',
    name: 'identity',
    connectionString: 'postgres://x',
    db: {} as never,
    logger: log as never,
  }),
});

beforeEach(() => {
  vi.useFakeTimers();
  for (const f of Object.values(fakes)) f.mockReset();
  fakes.connect.mockResolvedValue({ close: fakes.close });
  fakes.relay.mockResolvedValue(fakes.stopRelay);
  fakes.titles.mockResolvedValue(fakes.stopTitles);
  fakes.rights.mockResolvedValue(fakes.stopRights);
  fakes.close.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe('bus d’identity', () => {
  it('connecté : relais et consommateur des titres démarrés ; arrêt : tout refermé', async () => {
    const { log, stop } = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fakes.relay).toHaveBeenCalledWith(
      expect.objectContaining({ schema: 'identity', applicationName: 'identity-outbox-relay' }),
    );
    expect(fakes.titles).toHaveBeenCalledTimes(1);
    expect(fakes.rights).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith('consommateur identity-titles démarré');
    expect(log.info).toHaveBeenCalledWith('consommateur identity-rights démarré');
    await stop();
    expect(fakes.stopTitles).toHaveBeenCalled();
    expect(fakes.stopRights).toHaveBeenCalled();
    expect(fakes.stopRelay).toHaveBeenCalled();
    expect(fakes.close).toHaveBeenCalled();
  });

  it('NATS injoignable : nouvel essai après 1 s puis 2 s, sans bloquer', async () => {
    fakes.connect.mockRejectedValueOnce(new Error('refus')).mockRejectedValueOnce('encore');
    const { log, stop } = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'refus', retryInMs: 1000 }),
      expect.any(String),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(log.warn).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: 'encore', retryInMs: 2000 }),
      expect.any(String),
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(fakes.connect).toHaveBeenCalledTimes(3);
    expect(fakes.titles).toHaveBeenCalled();
    await stop();
  });

  it('relais impossible : signalé, le consommateur démarre quand même ; consommateur retenté', async () => {
    fakes.relay.mockRejectedValueOnce(new Error('pg'));
    fakes.titles.mockRejectedValueOnce(new Error('durable'));
    const { log, stop } = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.error).toHaveBeenCalledWith(
      { error: 'pg' },
      'relais d’outbox : démarrage impossible',
    );
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'durable' }),
      expect.stringContaining('identity-titles'),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(fakes.titles).toHaveBeenCalledTimes(2);
    await stop();
    expect(fakes.stopRelay).not.toHaveBeenCalled();
  });

  it('arrêté pendant la connexion : la connexion arrivée ensuite est refermée', async () => {
    let resolve!: (b: unknown) => void;
    fakes.connect.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { stop } = start();
    const stopping = stop();
    resolve({ close: fakes.close });
    await stopping;
    expect(fakes.close).toHaveBeenCalled();
    expect(fakes.relay).not.toHaveBeenCalled();
  });

  it('arrêté pendant le démarrage du consommateur : il est arrêté aussitôt ; échec après l’arrêt : ignoré', async () => {
    let resolve!: (s: unknown) => void;
    fakes.titles.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { stop } = start();
    await vi.advanceTimersByTimeAsync(0);
    const stopping = stop();
    resolve(fakes.stopTitles);
    await stopping;
    expect(fakes.stopTitles).toHaveBeenCalled();
    fakes.connect.mockRejectedValueOnce(new Error('x'));
    const second = start();
    await second.stop();
  });
});
