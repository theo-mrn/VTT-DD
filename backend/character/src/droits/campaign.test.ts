import { describe, expect, it, vi } from 'vitest';
import { droitsCampaign } from './campaign.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';

function reponse(corps: unknown, status = 200) {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('droits décidés par campaign', () => {
  it('interroge campaign avec le secret interne puis garde la réponse en cache', async () => {
    let maintenant = 1_000;
    const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) =>
      reponse({
        read: true,
        write: false,
        campaigns: [
          { campaignId: 'camp-1', role: 'player' },
          { campaignId: 'camp-2', role: 'gm' },
        ],
      }),
    );
    const droits = droitsCampaign({
      url: 'http://campaign.local',
      secret: SECRET,
      cacheMs: 5_000,
      fetch: fetch as unknown as typeof globalThis.fetch,
      maintenant: () => maintenant,
    });

    // Campagnes où il est MJ : ses écritures y sont annoncées en direct ; toutes ses
    // campagnes : la mise en page de la fiche y est annoncée
    expect(await droits.de('perso-1', 'user-1')).toEqual({
      lecture: true,
      ecriture: false,
      campagnesMj: ['camp-2'],
      campagnes: ['camp-1', 'camp-2'],
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      'http://campaign.local/internal/characters/perso-1/campaigns-of?userId=user-1',
    );
    expect((init!.headers as Record<string, string>)['x-internal-secret']).toBe(SECRET);

    await droits.de('perso-1', 'user-1');
    expect(fetch).toHaveBeenCalledTimes(1);
    maintenant += 5_001;
    await droits.de('perso-1', 'user-1');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('une panne de campaign n’ouvre aucun droit et n’est pas mise en cache', async () => {
    const signaler = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reponse({ title: 'Erreur' }, 503))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(reponse({ read: true, write: true, campaigns: [] }));
    const droits = droitsCampaign({
      url: 'http://campaign.local',
      secret: SECRET,
      cacheMs: 5_000,
      fetch,
      signaler,
    });
    expect(await droits.de('p', 'u')).toEqual({ lecture: false, ecriture: false });
    expect(await droits.de('p', 'u')).toEqual({ lecture: false, ecriture: false });
    expect(await droits.de('p', 'u')).toEqual({
      lecture: true,
      ecriture: true,
      campagnesMj: [],
      campagnes: [],
    });
    expect(signaler).toHaveBeenCalledTimes(2);
  });
});

describe('rôle dans une campagne décidé par campaign', () => {
  it('interroge la route des droits de la campagne puis garde le rôle en cache', async () => {
    let maintenant = 1_000;
    const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) =>
      reponse({ member: true, role: 'gm' }),
    );
    const droits = droitsCampaign({
      url: 'http://campaign.local',
      secret: SECRET,
      cacheMs: 5_000,
      fetch: fetch as unknown as typeof globalThis.fetch,
      maintenant: () => maintenant,
    });

    expect(await droits.role('camp-1', 'user-1')).toBe('gm');
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      'http://campaign.local/internal/campaigns/camp-1/rights?userId=user-1',
    );
    expect((init!.headers as Record<string, string>)['x-internal-secret']).toBe(SECRET);
    await droits.role('camp-1', 'user-1');
    expect(fetch).toHaveBeenCalledTimes(1);
    maintenant += 5_001;
    await droits.role('camp-1', 'user-1');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('non-membre : aucun rôle ; panne : erreur 503, jamais mise en cache', async () => {
    const signaler = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reponse({ member: false, role: null }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(reponse({ member: true, role: 'player' }));
    const droits = droitsCampaign({
      url: 'http://campaign.local',
      secret: SECRET,
      cacheMs: 0,
      fetch,
      signaler,
    });
    expect(await droits.role('c', 'u')).toBeNull();
    await expect(droits.role('c', 'u')).rejects.toMatchObject({ status: 503 });
    expect(await droits.role('c', 'u')).toBe('player');
    expect(signaler).toHaveBeenCalledTimes(1);
  });
});

describe('règles optionnelles de la campagne d’un personnage', () => {
  it('interroge la route des règles puis garde la réponse en cache', async () => {
    let maintenant = 1_000;
    const fetch = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) =>
      reponse({ campaignId: 'camp-1', options: { encombrement: true } }),
    );
    const droits = droitsCampaign({
      url: 'http://campaign.local',
      secret: SECRET,
      cacheMs: 5_000,
      fetch: fetch as unknown as typeof globalThis.fetch,
      maintenant: () => maintenant,
    });

    expect(await droits.options('perso-1')).toEqual({ encombrement: true });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('http://campaign.local/internal/characters/perso-1/rules');
    expect((init!.headers as Record<string, string>)['x-internal-secret']).toBe(SECRET);
    await droits.options('perso-1');
    expect(fetch).toHaveBeenCalledTimes(1);
    maintenant += 5_001;
    await droits.options('perso-1');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('hors campagne : aucune ; panne : défauts du système, jamais mis en cache', async () => {
    const signaler = vi.fn();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reponse({ campaignId: null, options: {} }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(reponse({ title: 'Erreur' }, 500))
      .mockResolvedValueOnce(reponse({ campaignId: 'c', options: { encombrement: true } }));
    const droits = droitsCampaign({
      url: 'http://campaign.local',
      secret: SECRET,
      cacheMs: 5_000,
      fetch,
      signaler,
    });
    expect(await droits.options('seul')).toEqual({});
    expect(await droits.options('p')).toEqual({});
    expect(await droits.options('p')).toEqual({});
    expect(await droits.options('p')).toEqual({ encombrement: true });
    expect(signaler).toHaveBeenCalledTimes(2);
  });
});
