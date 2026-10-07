/**
 * Préférences des raccourcis : lecture tolérante, touche effective, écarts seuls gardés,
 * raccourcis créés, reprise du legacy (seuls les choix de l'utilisateur), magasin du compte.
 */
import { describe, expect, it } from 'vitest';
import type { ShortcutDescriptor } from './registry';
import {
  bindingOf,
  convertLegacyBinding,
  customDescriptor,
  EMPTY_PREFS,
  migrateLegacy,
  normalizePrefs,
  ShortcutPrefsStore,
  withBinding,
  type ShortcutPrefs,
} from './store';

const chat: ShortcutDescriptor = {
  id: 'table.panel.chat',
  label: { text: 'Chat' },
  scope: 'table',
  defaultBinding: 'KeyC',
};

describe('préférences', () => {
  it('lecture tolérante : ids, touches et raccourcis créés invalides écartés', () => {
    const p = normalizePrefs({
      bindings: { 'table.panel.chat': 'Shift+KeyC', 'x y': 'KeyA', bad: 'Nope+KeyA', off: null },
      custom: [
        { id: 'a1', kind: 'roll', label: ' Attaque ', formula: '1d20+mod(@FOR)', binding: 'KeyF' },
        { id: 'a2', kind: 'macro', label: 'x', formula: '1d6', binding: null },
        { id: 'a3', kind: 'roll', label: '', formula: '1d6', binding: null },
      ],
    });
    expect(p.bindings).toEqual({ 'table.panel.chat': 'Shift+KeyC', off: null });
    expect(p.custom).toEqual([
      { id: 'a1', kind: 'roll', label: 'Attaque', formula: '1d20+mod(@FOR)', binding: 'KeyF' },
    ]);
    expect(normalizePrefs(null)).toEqual(EMPTY_PREFS);
  });

  it('touche effective, « Aucune », retour au défaut sans écart gardé', () => {
    let p: ShortcutPrefs = EMPTY_PREFS;
    expect(bindingOf(p, chat)).toBe('KeyC');
    p = withBinding(p, chat, null);
    expect(bindingOf(p, chat)).toBeNull();
    p = withBinding(p, chat, 'KeyC');
    expect(p.bindings).toEqual({});
    const fixe = { ...chat, id: 'fixed.undo', defaultBinding: 'Mod+KeyZ', fixed: true };
    expect(withBinding(p, fixe, 'KeyU')).toBe(p);
  });

  it('raccourci créé : sa touche vit dans la liste', () => {
    const p: ShortcutPrefs = {
      bindings: {},
      custom: [{ id: 'a1', kind: 'roll', label: 'Attaque', formula: '1d20', binding: null }],
    };
    const d = customDescriptor(p.custom[0]!);
    expect(d).toMatchObject({ id: 'custom.a1', scope: 'dice', late: true });
    expect(bindingOf(withBinding(p, d, 'KeyF'), d)).toBe('KeyF');
  });
});

describe('reprise du legacy', () => {
  const storage = (values: Record<string, unknown>) => ({
    getItem: (k: string) => (k in values ? JSON.stringify(values[k]) : null),
  });

  it('touches du legacy au format d’aujourd’hui', () => {
    expect(convertLegacyBinding('Ctrl+K')).toBe('Mod+KeyK');
    expect(convertLegacyBinding('Shift+N')).toBe('Shift+KeyN');
    expect(convertLegacyBinding('Code:Digit1')).toBe('Digit1');
    expect(convertLegacyBinding('Space Enter')).toBe('Space Enter');
    expect(convertLegacyBinding('+')).toBe('Char:+');
    expect(convertLegacyBinding('Weird+K')).toBeNull();
  });

  it('seuls les choix de l’utilisateur passent ; raccourcis personnalisés repris', () => {
    const p = migrateLegacy(
      storage({
        'vtt-dd-shortcuts-v2': {
          tab_chat: 'C', // défaut du legacy : ignoré
          tool_draw: 'Shift+D', // choisi
          tab_dice: '', // retiré
          roll_d20: 'Code:Digit6', // défaut
          inconnu: 'X',
        },
        'vtt-dd-custom-shortcuts': [
          { id: 'x', label: 'Attaque', command: '1d20+FOR', keyString: 'Shift+F' },
          { id: 'y', label: 'Vide', command: '', keyString: 'G' },
        ],
      }),
    );
    expect(p?.bindings).toEqual({ 'map.tool.draw': 'Shift+KeyD', 'table.panel.des': null });
    expect(p?.custom).toHaveLength(1);
    expect(p?.custom[0]).toMatchObject({
      label: 'Attaque',
      formula: '1d20+FOR',
      binding: 'Shift+KeyF',
    });
  });

  it('rien à reprendre : null', () => {
    expect(migrateLegacy(storage({}))).toBeNull();
    expect(migrateLegacy(null)).toBeNull();
  });

  it('compte vide : la reprise est envoyée au serveur ; compte déjà réglé : rien', async () => {
    const saved: unknown[] = [];
    const client = (version: number) => ({
      get: async () => ({ ...EMPTY_PREFS, version }),
      save: async (body: ShortcutPrefs & { version?: number }) => {
        saved.push(body);
        return { ...body, version: version + 1 };
      },
    });
    const legacy = storage({ 'vtt-dd-shortcuts-v2': { tool_draw: 'Shift+D' } });
    const vide = new ShortcutPrefsStore(client(0), 0, legacy);
    await vide.load();
    await vide.flush();
    expect(saved).toHaveLength(1);
    expect(vide.state.bindings).toEqual({ 'map.tool.draw': 'Shift+KeyD' });

    const regle = new ShortcutPrefsStore(client(3), 0, legacy);
    await regle.load();
    await regle.flush();
    expect(saved).toHaveLength(1);
  });
});
