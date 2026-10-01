import { describe, expect, it } from 'vitest';
import { boxKind, setup, spyPersistence } from '../../engine/test-kit';
import { LIGHT_KIND, LIGHTS, lightPosition, type LightData } from './model';
import { registerLights } from './register';
import { radiusFromDistance, type LightTool } from './tool';

const P = (x: number, y: number) => ({ x, y });

function light(id: string, extra: Partial<LightData> = {}): LightData {
  return {
    id,
    mapId: 'carte',
    version: 1,
    updatedAt: '',
    name: 'Torche',
    pos: P(500, 500),
    radius: 4,
    visible: true,
    color: '#ffb35c',
    intensity: 0.8,
    falloff: 0.5,
    attachedTokenId: null,
    ...extra,
  } as LightData;
}

function bench(opts: { lights?: LightData[] } = {}) {
  const kit = setup();
  const persistence = spyPersistence();
  kit.backend.collection = (key: string) =>
    (key === LIGHTS ? persistence : spyPersistence()) as never;
  // Des « tokens » factices (centre = x, y) pour les torches
  kit.engine.registerKind(boxKind(spyPersistence(), { id: 'token', collection: 'tokens' }));
  kit.store
    .getState()
    .replaceCollection('tokens', [
      { id: 'tok', version: 1, x: 200, y: 200, w: 50, h: 50, layerId: null, z: 0 },
    ]);
  kit.store.getState().replaceCollection(LIGHTS, opts.lights ?? []);
  registerLights(kit.engine);
  kit.engine.tools.activate('lights');
  const tool = kit.engine.tools.active as LightTool;
  const lights = () =>
    [...(kit.store.getState().collections[LIGHTS]?.values() ?? [])] as LightData[];
  return { ...kit, tool, persistence, lights };
}

describe('outil lumières', () => {
  it('un clic pose une lumière (centre de la case), sélectionnée, en une commande', async () => {
    const b = bench();
    b.click(P(312, 290));
    const [l] = b.lights();
    expect(l!.pos).toEqual(P(325, 275));
    expect(l).toMatchObject({ radius: 6, visible: true, attachedTokenId: null });
    expect(b.engine.selection.ids).toEqual([l!.id]);
    await b.commands.idle();
    expect(b.persistence.create).toHaveBeenCalledTimes(1);
    expect(b.engine.selection.ids).toEqual([b.lights()[0]!.id]);
  });

  it('Alt : pose libre', () => {
    const b = bench();
    b.click(P(312, 290), { alt: true });
    expect(b.lights()[0]!.pos).toEqual(P(312, 290));
  });

  it('poignée de rayon : rayon en unités, par demi-case, une commande au lâcher', async () => {
    const b = bench({ lights: [light('l')] });
    b.engine.selection.replace(['l']);
    // Poignée à l'est du cercle : 4 unités × 50 px
    b.drag(P(700, 500), P(820, 500), {}, false);
    expect(b.tool.state).toBe('radius');
    expect(b.tool.radiusDrag?.radius).toBe(6.5);
    expect(b.lights()[0]!.radius).toBe(4);
    b.engine.controller.pointerUp(b.pointer(P(820, 500), { buttons: 0 }));
    expect(b.lights()[0]!.radius).toBe(6.5);
    await b.commands.idle();
    expect(b.persistence.update).toHaveBeenCalledTimes(1);
  });

  it('Échap pendant la poignée : rien n’est écrit', () => {
    const b = bench({ lights: [light('l')] });
    b.engine.selection.replace(['l']);
    b.drag(P(700, 500), P(820, 500), {}, false);
    b.engine.controller.keyDown(b.key('Escape'));
    b.engine.controller.pointerUp(b.pointer(P(820, 500), { buttons: 0 }));
    expect(b.lights()[0]!.radius).toBe(4);
    expect(b.commands.history.undo).toHaveLength(0);
  });

  it('glisser une lumière la déplace (centre de case) ; seules les lumières se touchent avec L', () => {
    const b = bench({ lights: [light('l')] });
    expect(b.engine.hitTest(P(200, 200))).toBeNull();
    b.drag(P(500, 500), P(600, 500));
    expect(b.lights()[0]!.pos).toEqual(P(625, 525));
  });

  it('rayon depuis une distance : pas d’une demi-case, bornes', () => {
    expect(radiusFromDistance(160, 50, false)).toBe(3);
    expect(radiusFromDistance(1, 50, false)).toBe(0.5);
    expect(radiusFromDistance(163, 50, true)).toBe(3.26);
  });
});

describe('lumière attachée à un token (torche)', () => {
  it('suit le token, y compris pendant un glisser (aperçu), et ne se déplace pas seule', () => {
    const b = bench({ lights: [light('l', { attachedTokenId: 'tok' })] });
    const e = b.engine.entity('l')!;
    const token = b.engine.entity('tok')!;
    b.engine.tick(0);
    expect(e.current).toMatchObject(P(200, 200));
    expect(lightPosition(b.engine, e.data as LightData)).toEqual(P(200, 200));
    // Glisser du token (aperçu local ou direct d'un autre)
    b.engine.setPreview(token, { ...token.geometry, x: 260, y: 240 });
    b.engine.tick(0);
    expect(e.current).toMatchObject(P(260, 240));
    expect(lightPosition(b.engine, e.data as LightData)).toEqual(P(260, 240));
    expect(e.kind.can('move', e, b.engine.viewer)).toBe(false);
  });

  it('détachée, elle reste là où était le token', async () => {
    const b = bench({ lights: [light('l', { attachedTokenId: 'tok' })] });
    b.engine.tick(0);
    const e = b.engine.entity('l')!;
    const item = e.kind.actions!([e], { viewer: b.engine.viewer, engine: b.engine }).find(
      (i) => i.id === 'light:detach',
    );
    item!.run!();
    b.engine.tick(0);
    expect(b.lights()[0]).toMatchObject({ attachedTokenId: null, pos: P(200, 200) });
    expect(b.engine.entity('l')!.current).toMatchObject(P(200, 200));
    await b.commands.idle();
  });

  it('menu du token qui la porte (MJ) : éteindre, régler, retirer', async () => {
    const b = bench({ lights: [light('l', { attachedTokenId: 'tok' })] });
    b.engine.tick(0);
    const items = b.engine.menuItems(['tok'], P(200, 200));
    const carried = items.find((i) => i.id === 'light:carried');
    expect(carried?.children?.map((c) => c.id)).toEqual([
      'light:carried:toggle',
      'light:carried:settings',
      'light:carried:detach',
      'light:carried:remove',
    ]);
    carried!.children!.find((c) => c.id === 'light:carried:toggle')!.run!();
    b.engine.tick(0);
    expect(b.lights()[0]).toMatchObject({ visible: false });
    await b.commands.idle();
  });

  it('token absent : sa propre position', () => {
    const b = bench();
    expect(lightPosition(b.engine, { pos: P(1, 2), attachedTokenId: 'nope' })).toEqual(P(1, 2));
  });

  it('éteinte : son direct reste chez le MJ', () => {
    const b = bench({ lights: [light('on'), light('off', { visible: false })] });
    expect(b.engine.liveAudience('on')).toBe('public');
    expect(b.engine.liveAudience('off')).toBe('gm');
    expect(b.engine.entitiesOfKind(LIGHT_KIND)).toHaveLength(2);
  });
});
