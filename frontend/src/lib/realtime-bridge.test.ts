import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from './realtime';
import { premiereFois, relireVersion } from './realtime-bridge';

const evenement = (id: string): RealtimeEvent =>
  ({ seq: 1, redacted: false, event: { id } }) as unknown as RealtimeEvent;

describe('pont temps réel partagé', () => {
  it('un événement est appliqué une fois par domaine et par cache', () => {
    const client = new QueryClient();
    const e = evenement('e1');
    expect(premiereFois(client, 'synchro', e)).toBe(true);
    // Un second abonné reçoit le même événement : ignoré
    expect(premiereFois(client, 'synchro', e)).toBe(false);
    // Un autre domaine, ou un autre cache, l'applique pour son compte
    expect(premiereFois(client, 'combat', e)).toBe(true);
    expect(premiereFois(new QueryClient(), 'synchro', e)).toBe(true);
  });

  it('mémoire bornée : les plus anciens sont oubliés', () => {
    const client = new QueryClient();
    for (let i = 0; i < 300; i++) premiereFois(client, 'd', evenement(`e${i}`));
    expect(premiereFois(client, 'd', evenement('e0'))).toBe(true);
    expect(premiereFois(client, 'd', evenement('e299'))).toBe(false);
  });

  it('relecture sans annuler, puis une seconde si la donnée reste plus ancienne', async () => {
    const client = new QueryClient();
    const key = ['x'];
    let version = 1;
    const observer = client.getQueryCache().build(client, {
      queryKey: key,
      queryFn: async () => ({ version }),
    });
    observer.setData({ version: 1 });
    vi.spyOn(observer, 'getObserversCount').mockReturnValue(1);
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(async () => {
      // La première lecture était partie avant le changement
      client.setQueryData(key, { version: version++ === 1 ? 1 : 3 });
    });
    await relireVersion<{ version: number }>(client, key, 3, (d) => d.version);
    expect(invalidate).toHaveBeenNthCalledWith(
      1,
      { queryKey: key, exact: true },
      {
        cancelRefetch: false,
      },
    );
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(key)).toEqual({ version: 3 });
  });
});
