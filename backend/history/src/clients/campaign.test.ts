import { describe, expect, it, vi } from 'vitest';
import { campaignRights } from './campaign.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('campaignRights', () => {
  it('demande le rôle avec le secret et le garde en cache', async () => {
    let t = 0;
    const fetch = vi.fn(async () => json(200, { member: true, role: 'gm' }));
    const c = campaignRights({
      url: 'http://campaign',
      secret: 's',
      cacheMs: 1000,
      fetch,
      now: () => t,
    });
    expect(await c.role('c1', 'u1')).toBe('gm');
    expect(await c.role('c1', 'u1')).toBe('gm');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://campaign/internal/campaigns/c1/rights?userId=u1');
    expect((init.headers as Record<string, string>)['x-internal-secret']).toBe('s');
    t = 2000;
    await c.role('c1', 'u1');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('non-membre : null ; panne : 503 sans mise en cache', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(200, { member: false, role: null }))
      .mockResolvedValueOnce(json(500, {}))
      .mockResolvedValueOnce(json(200, { member: true, role: 'player' }));
    const onError = vi.fn();
    const c = campaignRights({
      url: 'http://campaign',
      secret: 's',
      cacheMs: 1000,
      fetch,
      onError,
    });
    expect(await c.role('c1', 'u1')).toBeNull();
    await expect(c.role('c2', 'u1')).rejects.toMatchObject({
      status: 503,
      code: 'campaign_unavailable',
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(await c.role('c2', 'u1')).toBe('player');
  });
});
