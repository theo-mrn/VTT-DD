import { describe, expect, it, vi } from 'vitest';
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

function mailer(fetch: typeof globalThis.fetch, log = journal()) {
  return createMailer({
    kourrierUrl: 'http://kourrier.test:8080',
    kourrierApiKey: 'kr_test',
    from: 'YNER <contact@yner.fr>',
    log,
    fetch,
    attendre: async () => {},
  });
}

describe('envoi par Kourrier', () => {
  it('envoie le template, ses données et une clé d’idempotence', async () => {
    const fetch = vi.fn().mockResolvedValue(reponse(202));
    await mailer(fetch).envoyer(mail);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://kourrier.test:8080/v1/emails');
    expect(init.headers.authorization).toBe('Bearer kr_test');
    expect(init.headers['idempotency-key']).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toEqual({
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
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(reponse(503))
      .mockResolvedValueOnce(reponse(202));
    const log = journal();
    await mailer(fetch, log).envoyer(mail);

    expect(fetch).toHaveBeenCalledTimes(3);
    const cles = fetch.mock.calls.map(([, init]) => init.headers['idempotency-key']);
    expect(new Set(cles).size).toBe(1);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('abandonne après trois échecs', async () => {
    const fetch = vi.fn().mockResolvedValue(reponse(503));
    await expect(mailer(fetch).envoyer(mail)).rejects.toMatchObject({ code: 'kourrier_503' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('ne réessaie pas une requête refusée', async () => {
    const fetch = vi.fn().mockResolvedValue(reponse(403));
    const erreur = await mailer(fetch)
      .envoyer(mail)
      .catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurKourrier);
    expect(erreur).toMatchObject({ statut: 403, code: 'kourrier_403' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('ne journalise ni l’adresse ni le lien', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reponse(503)).mockResolvedValueOnce(reponse(202));
    const log = journal();
    await mailer(fetch, log).envoyer(mail);
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

describe('adresse', () => {
  it.each([
    ['YNER <contact@yner.fr>', { email: 'contact@yner.fr', name: 'YNER' }],
    ['"Équipe YNER" <contact@yner.fr>', { email: 'contact@yner.fr', name: 'Équipe YNER' }],
    ['contact@yner.fr', { email: 'contact@yner.fr' }],
    ['<contact@yner.fr>', { email: 'contact@yner.fr' }],
  ])('%s', (brut, attendu) => {
    expect(adresse(brut)).toEqual(attendu);
  });
});
