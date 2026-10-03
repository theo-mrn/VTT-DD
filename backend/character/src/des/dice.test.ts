import { describe, expect, it, vi } from 'vitest';
import { journalDes, type JetAction } from './dice.js';

const jet: JetAction = {
  authorId: 'u1',
  characterId: 'c1',
  characterName: 'Thorin',
  characterAvatarUrl: null,
  actionId: 'attaque',
  systemId: 'dnd-classic',
  visibility: 'public',
  dice: [],
  outcome: { success: true, critical: false, fumble: false },
  explanations: [],
};

describe('journalDes', () => {
  it('envoie le jet à dice avec le secret interne', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 201 }));
    await journalDes({ url: 'http://dice', secret: 's', fetch }).transmettre(jet, 'corr-1');
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://dice/internal/rolls');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-internal-secret': 's', 'x-correlation-id': 'corr-1' });
    expect(JSON.parse(init.body as string)).toEqual(jet);
  });

  it('une panne de dice est signalée, jamais levée', async () => {
    const signaler = vi.fn();
    const enPanne = journalDes({
      url: 'http://dice',
      secret: 's',
      fetch: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
      signaler,
    });
    await expect(enPanne.transmettre(jet)).resolves.toBeUndefined();
    const refus = journalDes({
      url: 'http://dice',
      secret: 's',
      fetch: vi.fn(async () => new Response('{}', { status: 404 })),
      signaler,
    });
    await refus.transmettre(jet);
    expect(signaler).toHaveBeenCalledTimes(2);
    expect(signaler.mock.calls[1]![1]).toEqual({ characterId: 'c1', actionId: 'attaque' });
  });
});
