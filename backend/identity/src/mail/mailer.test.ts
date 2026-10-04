import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adresse, createMailer, ErreurKourrier, type Mail } from './mailer.js';

const mail: Mail = {
  to: 'alice@exemple.fr',
  modele: 'reinitialisation',
  donnees: { lien: 'https://yner.fr/reinitialisation?jeton=abc' },
};

function journal() {
  return { info: vi.fn(), warn: vi.fn() };
}

function reponse(statut: number): Response {
  return new Response(null, { status: statut });
}

function mailer(log = journal()) {
  return createMailer({
    kourrierUrl: 'http://kourrier.test:8080',
    kourrierApiKey: 'kr_test',
    from: 'YNER <contact@yner.fr>',
    log,
  });
}

/** Envoie en laissant s'écouler les délais entre deux tentatives. */
async function envoyer(m: ReturnType<typeof mailer>): Promise<unknown> {
  const envoi = m.envoyer(mail).then(
    () => null,
    (erreur: unknown) => erreur,
  );
  await vi.runAllTimersAsync();
  return envoi;
}

describe('envoi par Kourrier', () => {
  const fetch = vi.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetch.mockReset();
  });

  it('envoie le template, ses données et une clé d’idempotence', async () => {
    fetch.mockResolvedValue(reponse(202));
    expect(await envoyer(mailer())).toBeNull();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    const entetes = new Headers(init?.headers);
    expect(url).toBe('http://kourrier.test:8080/v1/emails');
    expect(entetes.get('authorization')).toBe('Bearer kr_test');
    expect(entetes.get('idempotency-key')).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      from: { email: 'contact@yner.fr', name: 'YNER' },
      to: [{ email: 'alice@exemple.fr' }],
      template: {
        name: 'reinitialisation',
        locale: 'fr',
        data: { lien: 'https://yner.fr/reinitialisation?jeton=abc' },
      },
      tags: { service: 'identity', modele: 'reinitialisation' },
    });
  });

  it('réessaie un Kourrier indisponible avec la même clé d’idempotence', async () => {
    fetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(reponse(503))
      .mockResolvedValueOnce(reponse(202));
    const log = journal();
    expect(await envoyer(mailer(log))).toBeNull();

    expect(fetch).toHaveBeenCalledTimes(3);
    const cles = fetch.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get('idempotency-key'),
    );
    expect(new Set(cles).size).toBe(1);
    expect(log.warn.mock.calls.map(([obj]) => obj)).toEqual([
      { modele: 'reinitialisation', tentative: 1, code: 'kourrier_injoignable' },
      { modele: 'reinitialisation', tentative: 2, code: 'kourrier_503' },
    ]);
  });

  it('abandonne après trois tentatives', async () => {
    fetch.mockResolvedValue(reponse(429));
    const erreur = await envoyer(mailer());
    expect(erreur).toBeInstanceOf(ErreurKourrier);
    expect(erreur).toMatchObject({ statut: 429, code: 'kourrier_429' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('ne réessaie pas une requête refusée', async () => {
    fetch.mockResolvedValue(reponse(403));
    expect(await envoyer(mailer())).toMatchObject({ statut: 403, code: 'kourrier_403' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('ne journalise ni l’adresse ni le lien', async () => {
    fetch.mockResolvedValueOnce(reponse(503)).mockResolvedValueOnce(reponse(202));
    const log = journal();
    await envoyer(mailer(log));
    const ecrit = JSON.stringify([...log.warn.mock.calls, ...log.info.mock.calls]);
    expect(ecrit).not.toContain('alice');
    expect(ecrit).not.toContain('jeton');
  });
});

describe('sans Kourrier', () => {
  it('journalise le modèle sans rien envoyer', async () => {
    const log = journal();
    const m = createMailer({ kourrierUrl: undefined, kourrierApiKey: undefined, from: 'x', log });
    await m.envoyer(mail);
    expect(log.info).toHaveBeenCalledWith(
      { modele: 'reinitialisation' },
      'e-mail non envoyé (KOURRIER_URL absent)',
    );
  });

  it('refuse une URL sans clé d’API', () => {
    expect(() =>
      createMailer({
        kourrierUrl: 'http://kourrier.test',
        kourrierApiKey: undefined,
        from: 'x',
        log: journal(),
      }),
    ).toThrow('KOURRIER_API_KEY');
  });
});

describe('ErreurKourrier', () => {
  it.each([
    [null, true],
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [401, false],
    [422, false],
  ])('statut %s : transitoire = %s', (statut, transitoire) => {
    expect(new ErreurKourrier(statut).transitoire).toBe(transitoire);
  });
});

describe('adresse', () => {
  it.each([
    ['YNER <contact@yner.fr>', { email: 'contact@yner.fr', name: 'YNER' }],
    ['"Équipe YNER" <contact@yner.fr>', { email: 'contact@yner.fr', name: 'Équipe YNER' }],
    ['  contact@yner.fr  ', { email: 'contact@yner.fr' }],
    ['<contact@yner.fr>', { email: 'contact@yner.fr' }],
  ])('%s', (brut, attendu) => {
    expect(adresse(brut)).toEqual(attendu);
  });
});
