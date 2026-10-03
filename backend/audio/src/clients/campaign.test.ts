import { describe, expect, it, vi } from 'vitest';
import { campaignRights } from './campaign.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('droits demandés à campaign', () => {
  it('secret interne, cache court, panne sans droit ouvert', async () => {
    let t = 0;
    const fetch = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)['x-internal-secret']).toBe('s'.repeat(32));
      return json({ member: true, role: 'gm' });
    });
    const rights = campaignRights({
      url: 'http://campaign.test',
      secret: 's'.repeat(32),
      cacheMs: 5_000,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => t,
    });
    expect(await rights.role('c1', 'u1')).toBe('gm');
    expect(await rights.role('c1', 'u1')).toBe('gm');
    expect(fetch).toHaveBeenCalledTimes(1);
    t = 6_000;
    await rights.role('c1', 'u1');
    expect(fetch).toHaveBeenCalledTimes(2);

    const down = campaignRights({
      url: 'http://campaign.test',
      secret: 's'.repeat(32),
      cacheMs: 5_000,
      fetch: (async () => json({}, 500)) as unknown as typeof globalThis.fetch,
    });
    await expect(down.role('c1', 'u1')).rejects.toMatchObject({ status: 503 });
  });

  it('non-membre : null', async () => {
    const rights = campaignRights({
      url: 'http://campaign.test',
      secret: 's'.repeat(32),
      cacheMs: 0,
      fetch: (async () =>
        json({ member: false, role: null })) as unknown as typeof globalThis.fetch,
    });
    expect(await rights.role('c1', 'u1')).toBeNull();
  });
});
