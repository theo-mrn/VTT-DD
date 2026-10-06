import { describe, expect, it } from 'vitest';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import { boxKind, setup, spyPersistence } from '@/lib/map/engine/test-kit';
import type { MapDto } from '@/lib/map/store/map-store';
import { listenerOf, soundWalls, wallsBetween } from './hearing';
import { readSoundDrag, SOUND_ZONES, type SoundZoneData } from './model';
import { registerSounds } from './register';
import type { SoundTool } from './tool';

const P = (x: number, y: number) => ({ x, y });

const wall = (id: string, points: { x: number; y: number }[], extra: Partial<MapDto> = {}) =>
  ({ id, kind: 'wall', points, isOpen: false, ...extra }) as unknown as MapDto;

function bench(viewer?: MapViewer) {
  const kit = setup({ viewer });
  const persistence = spyPersistence();
  kit.backend.collection = (key: string) =>
    (key === SOUND_ZONES ? persistence : spyPersistence()) as never;
  // Des « tokens » factices (centre = x, y)
  kit.engine.registerKind(boxKind(spyPersistence(), { id: 'token', collection: 'tokens' }));
  kit.store.getState().replaceCollection('tokens', [
    { id: 'a', version: 1, x: 100, y: 100, w: 50, h: 50, layerId: null, z: 0, characterId: 'c1' },
    { id: 'b', version: 1, x: 400, y: 100, w: 50, h: 50, layerId: null, z: 0, characterId: 'c2' },
    { id: 'pnj', version: 1, x: 9, y: 9, w: 50, h: 50, layerId: null, z: 0, characterId: 'x' },
  ]);
  registerSounds(kit.engine);
  const zones = () =>
    [...(kit.store.getState().collections[SOUND_ZONES]?.values() ?? [])] as SoundZoneData[];
  return { ...kit, persistence, zones };
}

describe('murs entre l’auditeur et la zone', () => {
  const walls = soundWalls([
    wall('mur', [P(50, 0), P(50, 100)]),
    wall('porte', [P(150, 0), P(150, 100)], { kind: 'door', isOpen: false }),
    wall('ouverte', [P(250, 0), P(250, 100)], { kind: 'door', isOpen: true }),
    wall('fenetre', [P(350, 0), P(350, 100)], { kind: 'window' }),
    wall('sens', [P(450, 0), P(450, 100)], { kind: 'one_way_wall', opacity: 0.4 }),
  ]);

  it('murs, portes fermées et sens unique bloquent ; fenêtre et porte ouverte non', () => {
    expect(walls.length / 4).toBe(3);
    expect(wallsBetween(P(0, 50), P(500, 50), walls)).toBe(3);
    expect(wallsBetween(P(200, 50), P(400, 50), walls)).toBe(0);
    expect(wallsBetween(P(0, 50), P(100, 50), walls)).toBe(1);
  });

  it('une ligne brisée compte chaque segment traversé ; le long d’un mur, rien', () => {
    const room = soundWalls([wall('salle', [P(0, 0), P(100, 0), P(100, 100), P(0, 100), P(0, 0)])]);
    expect(wallsBetween(P(50, 50), P(300, 50), room)).toBe(1);
    expect(wallsBetween(P(-50, 50), P(300, 50), room)).toBe(2);
    expect(wallsBetween(P(-50, -10), P(300, -10), room)).toBe(0);
  });
});

describe('auditeur', () => {
  it('MJ et spectateur : personne', () => {
    expect(listenerOf(bench().engine)).toBeNull();
    const spectator = { userId: 's', role: 'spectator', characterIds: ['c1'] } as const;
    expect(listenerOf(bench(spectator).engine)).toBeNull();
  });

  it('joueur : son personnage incarné, ou son token sélectionné', () => {
    const b = bench({ userId: 'j', role: 'player', characterIds: ['c2', 'c1'] });
    expect(listenerOf(b.engine)).toEqual(P(400, 100));
    b.engine.selection.replace(['a']);
    expect(listenerOf(b.engine)).toEqual(P(100, 100));
    // Un token qui n'est pas à lui ne compte pas
    b.engine.selection.replace(['pnj']);
    expect(listenerOf(b.engine)).toEqual(P(400, 100));
  });

  it('joueur sans token sur la scène : personne', () => {
    const b = bench({ userId: 'j', role: 'player', characterIds: ['absent'] });
    expect(listenerOf(b.engine)).toBeNull();
  });
});

describe('outil Zones sonores', () => {
  it('un clic pose une zone (centre de la case, rayon en pixels), une commande', async () => {
    const b = bench();
    b.engine.tools.activate('sounds');
    const tool = b.engine.tools.active as SoundTool;
    tool.settings.setState({ assetId: '0190a8f0-0000-7000-8000-000000000001', name: 'Taverne' });
    b.click(P(312, 290));
    const [z] = b.zones();
    expect(z).toMatchObject({ pos: P(325, 275), radius: 300, volume: 0.5, active: true });
    expect(z).toMatchObject({ name: 'Taverne', assetId: '0190a8f0-0000-7000-8000-000000000001' });
    expect(b.engine.ui.getState().inspector).toBeNull();
    await b.commands.idle();
    expect(b.persistence.create).toHaveBeenCalledTimes(1);
  });

  it('sans son choisi : la zone posée ouvre son inspecteur', () => {
    const b = bench();
    b.engine.tools.activate('sounds');
    b.click(P(100, 100));
    const [z] = b.zones();
    expect(z).toMatchObject({ name: 'Zone sonore', assetId: null });
    expect(b.engine.ui.getState().inspector).toEqual([z!.id]);
  });

  it('poignée de rayon : rayon en unités affiché, enregistré en pixels', async () => {
    const b = bench();
    b.store.getState().replaceCollection(SOUND_ZONES, [
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
    b.engine.tools.activate('sounds');
    const tool = b.engine.tools.active as SoundTool;
    b.engine.selection.replace(['z']);
    b.drag(P(700, 500), P(820, 500), {}, false);
    expect(tool.state).toBe('radius');
    expect(tool.radiusDrag?.radius).toBe(6.5);
    b.engine.controller.pointerUp(b.pointer(P(820, 500), { buttons: 0 }));
    expect(b.zones()[0]!.radius).toBe(325);
    await b.commands.idle();
    expect(b.persistence.update).toHaveBeenCalledTimes(1);
  });

  it('glisser depuis la bibliothèque : données lues, le reste ignoré', () => {
    expect(readSoundDrag('{"assetId":"x","name":"Pluie"}')).toEqual({
      assetId: 'x',
      name: 'Pluie',
    });
    expect(readSoundDrag('pas du json')).toBeNull();
    expect(readSoundDrag('{"name":"sans id"}')).toBeNull();
  });
});
