import { importedAssetId } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { createCatalog } from '../catalog/index.js';
import {
  addMusicState,
  addPlaylist,
  addTemplate,
  addZone,
  createPlan,
  legacyPlaylistId,
  type FirestoreDoc,
} from './transform.js';

const C = '0199a0c3-0000-7000-8000-000000000001';
const catalog = createCatalog({ publishedBase: 'https://cdn.test/audio/catalog' });
const doc = <T>(path: string, data: T): FirestoreDoc<T> => ({
  path,
  id: path.split('/').pop()!,
  data,
});

describe('import des sons de l’ancienne app', () => {
  it('YouTube nettoyé, catalogue reconnu, envoi à copier, doublons fusionnés', () => {
    const plan = createPlan();
    const yt = addTemplate(
      plan,
      doc('sound_templates/1/templates/a', {
        name: 'Épique',
        type: 'youtube',
        category: 'music',
        soundUrl: 'mtOuasYJnv8\t',
      }),
      C,
      catalog,
    );
    expect(yt).toBe(importedAssetId(C, 'youtube:mtOuasYJnv8'));
    expect(plan.assets.get(yt!)).toMatchObject({ source: 'youtube', kind: 'music' });
    const cat = addTemplate(
      plan,
      doc('sound_templates/1/templates/b', {
        name: 'Forêt',
        type: 'file',
        category: 'sound',
        soundUrl: 'https://assets.yner.fr/Audio/Foret de_nuit.mp3',
      }),
      C,
      catalog,
    )!;
    expect(plan.assets.get(cat)).toMatchObject({
      source: 'catalog',
      kind: 'sfx',
      catalogId: 'default.ambiance.foret-de-nuit',
    });
    const sw = addTemplate(
      plan,
      doc('sound_templates/1/templates/c', {
        name: 'Sabre',
        type: 'file',
        soundUrl: '/effects/Star%20Wars/Lightsaber/Lightsaber%20hit.wav',
      }),
      C,
      catalog,
    )!;
    expect(plan.assets.get(sw)).toMatchObject({
      source: 'catalog',
      catalogId: 'starwars.lightsaber.impact-sabre-laser',
    });
    const up = addTemplate(
      plan,
      doc('sound_templates/1/templates/d', {
        name: 'Perso',
        type: 'file',
        soundUrl: 'https://assets.yner.fr/sounds/1/x.mp3',
      }),
      C,
      catalog,
    )!;
    expect(plan.assets.get(up)).toMatchObject({
      source: 'upload',
      copyFrom: 'https://assets.yner.fr/sounds/1/x.mp3',
    });
    const again = addTemplate(
      plan,
      doc('sound_templates/1/templates/e', {
        name: 'Doublon',
        type: 'youtube',
        soundUrl: 'https://youtu.be/mtOuasYJnv8',
      }),
      C,
      catalog,
    );
    expect(again).toBe(yt);
    expect(plan.assets.get(yt!)!.legacy).toHaveLength(2);
    expect(
      addTemplate(
        plan,
        doc('sound_templates/1/templates/f', { type: 'youtube', soundUrl: 'pas-un-id' }),
        C,
        catalog,
      ),
    ).toBeNull();
    expect(plan.report.filter((r) => r.status === 'error')).toHaveLength(1);
  });

  it('playlist : pistes par chemin legacy, absentes signalées ; canal en pause à sa position', () => {
    const plan = createPlan();
    const a = addTemplate(
      plan,
      doc('sound_templates/1/templates/a', { name: 'A', type: 'youtube', soundUrl: 'mtOuasYJnv8' }),
      C,
      catalog,
    )!;
    const map = new Map([['sound_templates/1/templates/a', a]]);
    addPlaylist(
      plan,
      doc('sound_templates/1/playlists/p', { name: 'Combat', trackIds: ['a', 'zz'] }),
      C,
      (p) => map.get(p),
    );
    expect(plan.playlists[0]).toMatchObject({
      id: legacyPlaylistId('sound_templates/1/playlists/p'),
      assetIds: [a],
    });
    addMusicState(plan, '1', { templateId: 'a', timestamp: 129.053 }, C, (p) => map.get(p));
    expect(plan.channels[0]).toMatchObject({ assetId: a, positionMs: 129_053 });
    addMusicState(plan, '1', { templateId: 'inconnu', videoId: 'aaaaaaaaaaa' }, C, (p) =>
      map.get(p),
    );
    expect(plan.channels).toHaveLength(1);
  });

  it('zones : fichier du catalogue en ambiance, YouTube ignoré', () => {
    const plan = createPlan();
    addZone(
      plan,
      doc('cartes/1/musicZones/z', {
        name: 'Insectes',
        url: 'https://assets.yner.fr/Audio/insecte_nuit.mp3',
      }),
      C,
      catalog,
    );
    addZone(plan, doc('cartes/1/musicZones/y', { name: 'Épée', url: 'E8Ced6hW45k' }), C, catalog);
    expect([...plan.assets.values()].map((a) => [a.kind, a.source])).toEqual([
      ['ambience', 'catalog'],
    ]);
    expect(plan.report.find((r) => r.legacy.endsWith('/y'))?.status).toBe('ignored');
  });
});
