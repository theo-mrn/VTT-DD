// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Module neuf à chaque test : tampon, envoi et dédoublonnage repartent de zéro. */
async function fresh() {
  vi.resetModules();
  return import('./errors');
}

describe('erreurs du navigateur', () => {
  beforeEach(() => vi.useRealTimers());

  it('garde les erreurs en attendant le SDK, puis les envoie', async () => {
    const m = await fresh();
    m.reportClientError(new TypeError('a'), 'window');
    const sent: unknown[] = [];
    m.setErrorSink((e) => sent.push(e));
    expect(sent).toMatchObject([{ type: 'TypeError', message: 'a', source: 'window', path: '/' }]);
  });

  it('une même erreur au plus une fois par minute', async () => {
    vi.useFakeTimers();
    const m = await fresh();
    const sent: unknown[] = [];
    m.setErrorSink((e) => sent.push(e));
    const err = new Error('boucle');
    m.reportClientError(err, 'window');
    m.reportClientError(err, 'window');
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(61_000);
    m.reportClientError(err, 'window');
    expect(sent).toHaveLength(2);
  });

  it('écoute les exceptions et les promesses rejetées de la page', async () => {
    const m = await fresh();
    const sent: { source: string; message: string }[] = [];
    m.setErrorSink((e) => sent.push(e));
    m.installErrorCapture();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('plantage'), message: 'x' }));
    const rejected = new Event('unhandledrejection') as Event & { reason: unknown };
    rejected.reason = 'refus';
    window.dispatchEvent(rejected);
    expect(sent.map((e) => [e.source, e.message])).toEqual([
      ['window', 'plantage'],
      ['promise', 'refus'],
    ]);
  });
});
