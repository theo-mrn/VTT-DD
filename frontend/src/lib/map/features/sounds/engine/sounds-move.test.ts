import { describe, expect, it } from 'vitest';
import { boxKind, setup, spyPersistence } from '@/lib/map/engine/test-kit';
import { SOUND_ZONES, type SoundZoneData } from './model';
import { registerSounds } from './register';

const P = (x: number, y: number) => ({ x, y });

/** Une zone en (500, 500), un token dessous si demandé. */
function bench(withTokenUnder: boolean) {
  const kit = setup();
  const persistence = spyPersistence();
  kit.backend.collection = (key: string) =>
    (key === SOUND_ZONES ? persistence : spyPersistence()) as never;
  kit.engine.registerKind(boxKind(spyPersistence(), { id: 'token', collection: 'tokens' }));
  if (withTokenUnder)
    kit.store
      .getState()
      .replaceCollection('tokens', [
        { id: 't', version: 1, x: 500, y: 500, w: 200, h: 200, layerId: null, z: 0 },
      ]);
  registerSounds(kit.engine);
  kit.store.getState().replaceCollection(SOUND_ZONES, [
    {
      id: 'z',
      mapId: 'carte',
      version: 1,
      updatedAt: '',
      name: 'Feu',
      pos: P(500, 500),
      radius: 200,
      url: null,
      assetId: null,
      volume: 0.5,
      color: null,
      active: true,
    },
  ]);
  const pos = () =>
    ([...(kit.store.getState().collections[SOUND_ZONES]?.values() ?? [])][0] as SoundZoneData).pos;
  return { ...kit, pos };
}

describe('déplacer une zone sonore', () => {
  it('outil Zones sonores (F) : se glisse, même sur un token', () => {
    const b = bench(true);
    b.engine.tools.activate('sounds');
    b.drag(P(500, 500), P(650, 500));
    expect(b.pos()).not.toEqual(P(500, 500));
  });

  it('outil Sélection (V), rien dessous : se glisse directement', () => {
    const b = bench(false);
    b.engine.tools.activate('select');
    b.drag(P(500, 500), P(650, 500));
    expect(b.pos()).not.toEqual(P(500, 500));
    expect(b.engine.ui.getState().picker).toBeNull();
  });

  it('outil Sélection (V), token dessous : choix dans la pile, puis la zone choisie se glisse', () => {
    const b = bench(true);
    b.engine.tools.activate('select');
    b.click(P(500, 500));
    expect(b.engine.ui.getState().picker?.ids).toEqual(['z', 't']);
    expect(b.pos()).toEqual(P(500, 500));
    b.engine.chooseAmong('z', ['z', 't']);
    b.drag(P(500, 500), P(650, 500));
    expect(b.pos()).not.toEqual(P(500, 500));
  });

  it('un élément porté par le token du dessus (torche) ne se propose pas', () => {
    const b = bench(true);
    const zone = b.engine.entity('z')!;
    (zone.kind as { carriedBy?: (d: unknown) => string | null }).carriedBy = () => 't';
    b.engine.tools.activate('select');
    expect(b.engine.confusablesAt(P(500, 500))).toBeNull();
  });
});
