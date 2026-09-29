import { describe, expect, it, vi } from 'vitest';
import type { MapViewer } from '../../engine/entities/entity-kind';
import { GM, setup } from '../../engine/test-kit';
import { registerDrawings } from './register';
import { drawingsRuntime } from './runtime';
import {
  createDrawSettings,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  type SettingsStorage,
} from './settings';
import { layoutNote } from './text-layout';
import type { NoteData } from './types';

const PLAYER: MapViewer = { userId: 'joueur', role: 'player', characterIds: [] };

function textSetup(viewer: MapViewer = GM) {
  const t = setup({ viewer });
  registerDrawings(t.engine, { storage: null });
  const rt = drawingsRuntime(t.engine)!;
  t.engine.tools.activate('text');
  const notes = () => [...(t.store.getState().collections.notes?.values() ?? [])] as NoteData[];
  return { ...t, rt, notes };
}

describe('outil Texte', () => {
  it('un clic ouvre l’édition à ce point ; Entrée écrit le texte (une commande)', async () => {
    const t = textSetup(PLAYER);
    t.rt.settings.patch({ text: { color: '#3e9bf5', fontSize: 40 } });
    t.click({ x: 200, y: 300 });
    const s = t.rt.editor.session!;
    expect(s.id).toBeNull();
    // Le point cliqué est le haut de la boîte : `pos` est sur la ligne de base
    expect(s.pos.x).toBe(200);
    expect(s.pos.y).toBeCloseTo(300 + layoutNote('', 40, s.fontFamily).baseline, 1);
    t.rt.editor.setText('La Licorne\ndorée  ');
    await t.rt.editor.commit();
    expect(t.rt.editor.session).toBeNull();
    const [draft] = vi.mocked(t.rt.notes.create!).mock.calls[0]![0];
    expect(draft).toMatchObject({
      text: 'La Licorne\ndorée',
      color: '#3e9bf5',
      fontSize: 40,
      layerId: null,
      createdBy: 'joueur',
    });
    expect(t.notes()).toHaveLength(1);
  });

  it('un texte vide n’est pas posé ; Échap n’écrit rien', async () => {
    const t = textSetup();
    t.click({ x: 200, y: 300 });
    t.rt.editor.setText('   ');
    await t.rt.editor.commit();
    t.rt.editor.openNew({ x: 10, y: 10 });
    t.rt.editor.setText('Oublié');
    t.rt.editor.cancel();
    await t.commands.idle();
    expect(t.rt.notes.create).not.toHaveBeenCalled();
  });

  it('le clic qui ferme l’éditeur n’en ouvre pas un autre', async () => {
    const t = textSetup();
    t.click({ x: 200, y: 300 });
    t.rt.editor.setText('Ici');
    // Clic ailleurs : le texte est écrit, pas de nouvel éditeur
    t.click({ x: 600, y: 600 });
    expect(t.rt.editor.session).toBeNull();
    t.click({ x: 600, y: 600 });
    expect(t.rt.editor.session).toBeNull();
    await t.commands.idle();
    expect(t.rt.notes.create).toHaveBeenCalledTimes(1);
  });

  it('un clic sur un de mes textes le rouvre ; vidé, il est supprimé (annulable)', async () => {
    const t = textSetup(PLAYER);
    t.store.getState().upsert('notes', [
      {
        id: 'n',
        version: 1,
        mapId: 'carte',
        updatedAt: '',
        layerId: null,
        z: 1,
        text: 'Pont',
        pos: { x: 400, y: 400 },
        color: '#f5f1e8',
        fontSize: 32,
        fontFamily: null,
        createdBy: 'joueur',
      },
    ]);
    const g = t.engine.entity('n')!.geometry;
    t.click({ x: g.x, y: g.y });
    expect(t.rt.editor.session?.id).toBe('n');
    t.rt.editor.setText('Pont-Levis');
    await t.rt.editor.commit();
    await t.commands.idle();
    expect(vi.mocked(t.rt.notes.update).mock.calls[0]![0][0]!.changes).toEqual({
      text: 'Pont-Levis',
    });
    t.rt.editor.openExisting(t.engine.entity('n')!);
    t.rt.editor.setText('');
    await t.rt.editor.commit();
    expect(t.notes()).toHaveLength(0);
    await t.commands.undo();
    expect(t.notes()).toHaveLength(1);
  });

  it('changer d’outil écrit le texte en cours', async () => {
    const t = textSetup();
    t.click({ x: 200, y: 300 });
    t.rt.editor.setText('Gardé');
    t.engine.tools.activate('select');
    await t.commands.idle();
    expect(t.rt.notes.create).toHaveBeenCalledTimes(1);
  });
});

describe('réglages mémorisés', () => {
  const memory = (
    initial: Record<string, string> = {},
  ): SettingsStorage & { data: Record<string, string> } => {
    const data = { ...initial };
    return {
      data,
      getItem: (k) => data[k] ?? null,
      setItem: (k, v) => {
        data[k] = v;
      },
    };
  };

  it('relus et vérifiés, une valeur abîmée reprend sa valeur par défaut', () => {
    const storage = memory({
      [SETTINGS_KEY]: JSON.stringify({ shape: 'circle', width: 9999, color: 'nope', opacity: 0.4 }),
    });
    const s = createDrawSettings(storage).getState();
    expect(s.shape).toBe('circle');
    expect(s.width).toBe(80);
    expect(s.color).toBe(DEFAULT_SETTINGS.color);
    expect(s.opacity).toBe(0.4);
  });

  it('gardés à chaque changement', () => {
    const storage = memory();
    const store = createDrawSettings(storage);
    store.patch({ color: '#12a594', text: { fontSize: 56 } });
    expect(JSON.parse(storage.data[SETTINGS_KEY]!)).toMatchObject({
      color: '#12a594',
      text: { fontSize: 56 },
    });
  });

  it('un stockage qui refuse ne casse rien', () => {
    const broken: SettingsStorage = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('plein');
      },
    };
    const store = createDrawSettings(broken);
    expect(store.getState()).toEqual(DEFAULT_SETTINGS);
    store.patch({ shape: 'line' });
    expect(store.getState().shape).toBe('line');
    expect(createDrawSettings(memory({ [SETTINGS_KEY]: '{pas du json' })).getState()).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
