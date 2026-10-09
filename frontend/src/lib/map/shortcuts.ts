/**
 * Raccourcis de la carte (docs/raccourcis.md § 7) : chaque outil (`registerTool`) et chaque
 * action (`registerAction`) est une commande `map`. Leur touche par défaut est celle qu'ils
 * déclarent ; l'utilisateur la change dans l'éditeur, la carte lit la touche effective.
 *
 * `MAP_SHORTCUTS` est la liste que montre l'éditeur, même hors de la carte (page du profil).
 * Un test (`lib/map/test/map-shortcuts.test.ts`) la compare à ce que déclarent les fonctions
 * chargées, rôle par rôle : une fonction qui ajoute un outil ou une action ajoute sa ligne ici.
 */
import type { MessageKey } from '@/i18n/types';
import type { ShortcutDescriptor, ShortcutRole } from '@/lib/shortcuts/registry';

export const mapToolShortcutId = (toolId: string) => `map.tool.${toolId}`;
export const mapActionShortcutId = (actionId: string) => `map.action.${actionId}`;

/** Outil ou action tel que la carte le déclare (libellé déjà dans la langue de la page). */
interface Declared {
  id: string;
  label: string;
  shortcut?: { code: string; label: string };
}

/** Commande d'un outil de la carte. */
export const mapToolShortcut = (def: Declared): ShortcutDescriptor => ({
  id: mapToolShortcutId(def.id),
  label: { text: def.label },
  scope: 'map',
  defaultBinding: def.shortcut?.code ?? null,
  single: true,
});

/** Commande d'une action de la carte. */
export const mapActionShortcut = (action: Declared): ShortcutDescriptor => ({
  id: mapActionShortcutId(action.id),
  label: { text: action.label },
  scope: 'map',
  defaultBinding: action.shortcut?.code ?? null,
  single: true,
});

const GM: readonly ShortcutRole[] = ['gm'];
const PLAYING: readonly ShortcutRole[] = ['gm', 'player'];

const tool = (
  id: string,
  label: MessageKey,
  key: string | null,
  roles?: readonly ShortcutRole[],
): ShortcutDescriptor => ({
  ...mapToolShortcut({ id, label: '', ...(key ? { shortcut: { code: key, label: '' } } : {}) }),
  label,
  ...(roles ? { roles } : {}),
});

const action = (
  id: string,
  label: MessageKey,
  key: string | null,
  roles?: readonly ShortcutRole[],
): ShortcutDescriptor => ({
  ...mapActionShortcut({ id, label: '', ...(key ? { shortcut: { code: key, label: '' } } : {}) }),
  label,
  ...(roles ? { roles } : {}),
});

export const MAP_SHORTCUTS: readonly ShortcutDescriptor[] = [
  tool('select', 'map.tools.select', 'KeyV'),
  tool('draw', 'map.tools.draw', 'KeyP', PLAYING),
  tool('text', 'map.tools.text', 'KeyT', PLAYING),
  tool('measure', 'map.tools.measure', 'KeyZ', PLAYING),
  tool('objects', 'map.tools.objects', 'KeyI', GM),
  tool('tokens', 'map.tools.tokens', 'KeyA', GM),
  tool('portals', 'map.tools.portals', 'KeyX', GM),
  tool('obstacles', 'map.tools.obstacles', 'KeyW', GM),
  tool('fog', 'map.tools.fog', 'KeyG', GM),
  tool('lights', 'map.tools.lights', 'KeyL', GM),
  tool('sounds', 'map.tools.sounds', 'KeyF', GM),
  action('layers.panel', 'map.actions.layersPanel', 'KeyK', GM),
  action('grid.toggle', 'map.actions.gridToggle', 'KeyQ'),
  action('grid.panel', 'map.actions.scalePanel', null, GM),
  action('combat.attack', 'map.actions.combatAttack', 'KeyY', PLAYING),
  action('presence.cursor', 'map.actions.presenceCursor', null, PLAYING),
  action('movement-path.toggle', 'map.actions.movementPathToggle', 'Shift+KeyT'),
  action('camera.fit', 'map.actions.cameraFit', null),
  action('camera.zoom-in', 'map.actions.cameraZoomIn', 'Char:+'),
  action('camera.zoom-out', 'map.actions.cameraZoomOut', 'Char:-'),
  action('fullscreen.toggle', 'map.actions.fullscreenToggle', null),
  action('fog.cover', 'map.actions.fogCover', null, GM),
  action('fog.reveal', 'map.actions.fogReveal', null, GM),
  action('exploration.toggle', 'map.actions.explorationToggle', null, GM),
  action('exploration.reset', 'map.actions.explorationReset', null, GM),
];

const BY_ID = new Map(MAP_SHORTCUTS.map((d) => [d.id, d]));

/** Commande d'une action de la carte, par son id d'action (`grid.toggle`). */
export const mapActionShortcutOf = (actionId: string) => BY_ID.get(mapActionShortcutId(actionId))!;

/**
 * La bulle du joueur : écoutée sur toute la table (pas seulement la carte focalisée), après la
 * page. Même touche que les calques du MJ, rôles disjoints.
 */
export const BUBBLE_SHORTCUT: ShortcutDescriptor = {
  id: 'map.bubble',
  label: 'shortcuts.commands.bubble',
  scope: 'table',
  defaultBinding: 'KeyK',
  roles: ['player'],
  late: true,
};
