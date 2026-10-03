// @vitest-environment jsdom
/**
 * Panneau « Calques » : créer (calque actif, suit l'identifiant du serveur), renommer,
 * modifier, réordonner, sélectionner le contenu, supprimer (contenu descendu, annulable).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { fixtures, GM, mountMap, type MapHarness } from '../test/map-harness';
import {
  createLayer,
  deleteLayer,
  renameLayer,
  reorderLayers,
  selectLayerContent,
  updateLayer,
} from './layer-operations';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

const layerIds = (m: MapHarness) => m.engine.layersBottomUp().map((l) => l.id);

describe('calques du MJ', () => {
  it('nouveau calque en haut de la pile, actif, et qui suit l’identifiant du serveur', async () => {
    h = await mountMap({ viewer: GM, headless: true });
    const done = createLayer(h.engine, '  Toits  ');
    const draft = h.engine.ui.getState().activeLayerId!;
    expect(h.engine.layer(draft)?.name).toBe('Toits');
    expect(h.engine.layersBottomUp().at(-1)?.id).toBe(draft);
    expect(await done).toBe(true);
    await h.commands.idle();
    expect(h.engine.ui.getState().activeLayerId).toBe(`srv-${draft}`);
    // Nom vide : « Calque »
    void createLayer(h.engine, '   ');
    expect(h.engine.layer(h.engine.ui.getState().activeLayerId)?.name).toBe('Calque');
  });

  it('sans persistance : rien', async () => {
    h = await mountMap({ viewer: GM, headless: true });
    (h.engine as unknown as { backend: null }).backend = null;
    expect(createLayer(h.engine, 'X')).toBeNull();
    expect(updateLayer(h.engine, 'sol', { locked: true }, 'Verrouiller')).toBeNull();
    expect(reorderLayers(h.engine, 'sol', ['sol'])).toBeNull();
    expect(await deleteLayer(h.engine, 'sol')).toBe(false);
  });

  it('renommer, masquer aux joueurs, verrouiller, opacité ; annulable', async () => {
    h = await mountMap({ viewer: GM, headless: true });
    expect(renameLayer(h.engine, 'sol', '   ')).toBeNull();
    await renameLayer(h.engine, 'sol', ' Dallage ');
    await updateLayer(h.engine, 'sol', { visibleToPlayers: false, opacity: 0.5 }, 'Masquer');
    await h.commands.idle();
    expect(h.engine.layer('sol')).toMatchObject({
      name: 'Dallage',
      visibleToPlayers: false,
      opacity: 0.5,
    });
    expect(h.persistence('layers').update).toHaveBeenCalledTimes(2);
    expect(updateLayer(h.engine, 'inconnu', { locked: true }, 'x')).toBeNull();
    await h.commands.undo();
    expect(h.engine.layer('sol')?.visibleToPlayers).toBe(true);
  });

  it('réordonner : seul le calque déplacé est réécrit', async () => {
    h = await mountMap({ viewer: GM, headless: true });
    expect(layerIds(h)).toEqual(['sol', 'objets', 'persos', 'secret']);
    // Panneau (haut → bas) : le sol passe tout en haut
    await reorderLayers(h.engine, 'sol', ['sol', 'secret', 'persos', 'objets']);
    await h.commands.idle();
    expect(layerIds(h)).toEqual(['objets', 'persos', 'secret', 'sol']);
    const sent = h.persistence('layers').update.mock.calls[0]![0];
    expect(sent.map((u: { after: { id: string } }) => u.after.id)).toEqual(['sol']);
    // Ordre inchangé : rien
    expect(reorderLayers(h.engine, 'sol', ['sol', 'secret', 'persos', 'objets'])).toBeNull();
  });

  it('sélectionner le contenu d’un calque (ce qui se sélectionne)', async () => {
    h = await mountMap({ viewer: GM, headless: true });
    selectLayerContent(h.engine, 'persos');
    expect([...h.engine.selection.ids].sort()).toEqual(['t-barde', 't-heros', 't-orc']);
  });

  it('supprimer : confirmation, contenu descendu, annuler recrée et remet', async () => {
    h = await mountMap({ viewer: GM, headless: true });
    h.engine.setActiveLayer('objets');
    const pending = deleteLayer(h.engine, 'objets');
    await Promise.resolve();
    const ask = h.engine.ui.getState().confirm!;
    expect(ask.title).toBe('Supprimer le calque « objets » ?');
    expect(ask.message).toBe('Son contenu (2 éléments) descend dans « sol ».');
    ask.resolve(true);
    expect(await pending).toBe(true);
    await h.commands.idle();
    expect(layerIds(h)).toEqual(['sol', 'persos', 'secret']);
    expect(h.engine.entity('o-coffre')!.layerId).toBe('sol');
    expect(h.engine.ui.getState().activeLayerId).toBeNull();
    expect(h.backend.deleteLayer).toHaveBeenCalledWith('objets', 'sol');
    await h.commands.undo();
    await h.commands.idle();
    expect(h.engine.layersBottomUp().map((l) => l.name)).toContain('objets');
  });

  it('supprimer : refus, calque vide, plus bas calque, dernier calque', async () => {
    h = await mountMap({
      viewer: GM,
      headless: true,
      collections: { layers: [fixtures.layer('a', 0, null), fixtures.layer('b', 1, null)] },
    });
    let pending = deleteLayer(h.engine, 'a');
    await Promise.resolve();
    expect(h.engine.ui.getState().confirm!.message).toBe('Il est vide.');
    h.engine.ui.getState().confirm!.resolve(false);
    expect(await pending).toBe(false);
    pending = deleteLayer(h.engine, 'a');
    await Promise.resolve();
    h.engine.ui.getState().confirm!.resolve(true);
    expect(await pending).toBe(true);
    await h.commands.idle();
    expect(await deleteLayer(h.engine, 'b')).toBe(false);
    expect(h.notify).toHaveBeenCalledWith('Le dernier calque ne se supprime pas.');
    expect(await deleteLayer(h.engine, 'inconnu')).toBe(false);
  });
});
