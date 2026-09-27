import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fakeServices } from '../test/fake-services.js';
import { EffectFailed, httpEffects } from './effects.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';

describe('effets dans dice et identity (routes internes)', () => {
  let services: Awaited<ReturnType<typeof fakeServices>>;
  beforeAll(async () => {
    services = await fakeServices(SECRET);
  });
  afterAll(() => services.close());

  it('appelle les routes internes avec le secret partagé', async () => {
    const effects = httpEffects({
      diceUrl: services.url,
      identityUrl: services.url,
      secret: SECRET,
    });
    const id = crypto.randomUUID();
    await effects.grantSkin(id, 'bismuth');
    await effects.setAllSkins(id, true);
    await effects.setPremium(id, true);
    expect(services.callsFor(id)).toEqual([
      { 'inventory/bismuth': { source: 'purchase' } },
      { 'all-skins': { allSkins: true } },
      { premium: { premium: true } },
    ]);
  });

  it('échoue (à rejouer) si un service manque, refuse ou tombe ; compte supprimé : sans suite', async () => {
    const id = crypto.randomUUID();
    await expect(httpEffects({ secret: SECRET }).setAllSkins(id, true)).rejects.toBeInstanceOf(
      EffectFailed,
    );
    const wrong = httpEffects({
      diceUrl: services.url,
      identityUrl: services.url,
      secret: 'x'.repeat(40),
    });
    await expect(wrong.grantSkin(id, 'ruby')).rejects.toThrow('dice a répondu 401');
    const down = httpEffects({
      diceUrl: 'http://127.0.0.1:1',
      identityUrl: services.url,
      secret: SECRET,
    });
    await expect(down.setAllSkins(id, false)).rejects.toThrow(/dice injoignable/);

    const effects = httpEffects({
      diceUrl: services.url,
      identityUrl: services.url,
      secret: SECRET,
    });
    services.deleteAccount(id);
    await expect(effects.setPremium(id, false)).resolves.toBeUndefined();
    services.setDown(true);
    await expect(effects.setPremium(crypto.randomUUID(), true)).rejects.toThrow(
      'identity a répondu 500',
    );
    services.setDown(false);
  });
});
