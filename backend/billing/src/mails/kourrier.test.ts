import { describe, expect, it, vi } from 'vitest';
import { address, kourrierMailer, MailFailed } from './kourrier.js';
import { day, money } from './messages.js';

const mail = {
  to: 'joueur@yner.test',
  template: 'facture' as const,
  data: { montant: '4,99 €' },
  idempotencyKey: '0192aaaa-0000-7000-8000-000000000001',
};

describe('envoi par Kourrier', () => {
  it('envoie template, données, expéditeur et clé d’idempotence', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 202 }));
    const mailer = kourrierMailer({
      url: 'http://kourrier.test',
      apiKey: 'kr_test',
      from: 'YNER <contact@yner.fr>',
      log: { info: vi.fn() },
      fetch,
    });
    await mailer.send(mail);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://kourrier.test/v1/emails');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer kr_test',
      'idempotency-key': mail.idempotencyKey,
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: { email: 'contact@yner.fr', name: 'YNER' },
      to: [{ email: 'joueur@yner.test' }],
      template: { name: 'facture', locale: 'fr', data: { montant: '4,99 €' } },
      tags: { service: 'billing', modele: 'facture' },
    });
  });

  it('distingue les échecs à réessayer des refus définitifs', async () => {
    const mailerFor = (fetch: typeof globalThis.fetch) =>
      kourrierMailer({
        url: 'http://k.test',
        apiKey: 'kr_x',
        from: 'a@yner.fr',
        log: { info: vi.fn() },
        fetch,
      });
    const failure = async (fetch: typeof globalThis.fetch) =>
      mailerFor(fetch)
        .send(mail)
        .catch((e: MailFailed) => [e.status, e.retryable]);
    expect(await failure(async () => new Response(null, { status: 503 }))).toEqual([503, true]);
    expect(await failure(async () => new Response(null, { status: 429 }))).toEqual([429, true]);
    expect(await failure(async () => new Response(null, { status: 422 }))).toEqual([422, false]);
    expect(
      await failure(async () => {
        throw new Error('réseau');
      }),
    ).toEqual([null, true]);
  });

  it('sans KOURRIER_URL : journalisé seulement ; clé obligatoire sinon', async () => {
    const log = { info: vi.fn() };
    await kourrierMailer({ url: undefined, apiKey: undefined, from: 'a@yner.fr', log }).send(mail);
    expect(log.info).toHaveBeenCalledWith({ template: 'facture' }, expect.any(String));
    expect(JSON.stringify(log.info.mock.calls)).not.toContain('joueur@yner.test');
    expect(() =>
      kourrierMailer({ url: 'http://k.test', apiKey: undefined, from: 'a@yner.fr', log }),
    ).toThrow(/KOURRIER_API_KEY/);
  });

  it('formats : adresse, montant, date de Paris', () => {
    expect(address('"Yner" <contact@yner.fr>')).toEqual({ email: 'contact@yner.fr', name: 'Yner' });
    expect(address('contact@yner.fr')).toEqual({ email: 'contact@yner.fr' });
    expect(money(499)).toBe('4,99 €');
    expect(money(4990)).toBe('49,90 €');
    expect(day('2026-10-31T23:30:00Z')).toBe('1 novembre 2026');
    expect(day(null)).toBe('');
  });
});
