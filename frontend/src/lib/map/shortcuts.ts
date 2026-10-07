/**
 * Raccourcis de la carte (docs/raccourcis.md § 7) : chaque outil (`registerTool`) et chaque
 * action (`registerAction`) est une commande `map`. Leur touche par défaut est celle qu'ils
 * déclarent ; l'utilisateur la change dans l'éditeur, la carte lit la touche effective.
 *
 * `MAP_SHORTCUTS` est la liste que montre l'éditeur, même hors de la carte (page du profil).
 * Un test (`lib/map/test/map-shortcuts.test.ts`) la compare à ce que déclarent les fonctions
 * chargées, rôle par rôle : une fonction qui ajoute un outil ou une action ajoute sa ligne ici.
 */
import type { ShortcutDescriptor, ShortcutRole } from '@/lib/shortcuts/registry';

export const mapToolShortcutId = (toolId: string) => `map.tool.${toolId}`;
export const mapActionShortcutId = (actionId: string) => `map.action.${actionId}`;

interface Declared {
  id: string;
  label: string;
  shortcut?: { code: string; label: string };
}

/** Commande d'un outil de la carte. */
export const mapToolShortcut = (def: Declared): ShortcutDescriptor => ({
  id: mapToolShortcutId(def.id),
  label: def.label,
  scope: 'map',
  defaultBinding: def.shortcut?.code ?? null,
  single: true,
});

/** Commande d'une action de la carte. */
export const mapActionShortcut = (action: Declared): ShortcutDescriptor => ({
  id: mapActionShortcutId(action.id),
  label: action.label,
  scope: 'map',
  defaultBinding: action.shortcut?.code ?? null,
  single: true,
});

const GM: readonly ShortcutRole[] = ['gm'];
const PLAYING: readonly ShortcutRole[] = ['gm', 'player'];

const tool = (
  id: string,
  label: string,
  key: string | null,
  roles?: readonly ShortcutRole[],
): ShortcutDescriptor => ({
  ...mapToolShortcut({ id, label, ...(key ? { shortcut: { code: key, label: '' } } : {}) }),
  ...(roles ? { roles } : {}),
});

const action = (
  id: string,
  label: string,
  key: string | null,
  roles?: readonly ShortcutRole[],
): ShortcutDescriptor => ({
  ...mapActionShortcut({ id, label, ...(key ? { shortcut: { code: key, label: '' } } : {}) }),
  ...(roles ? { roles } : {}),
});

export const MAP_SHORTCUTS: readonly ShortcutDescriptor[] = [
  tool('select', 'Sélection', 'KeyV'),
  tool('draw', 'Dessin', 'KeyP', PLAYING),
  tool('text', 'Texte', 'KeyT', PLAYING),
  tool('measure', 'Mesurer', 'KeyZ', PLAYING),
  tool('objects', 'Objets', 'KeyI', GM),
  tool('tokens', 'Personnages', 'KeyA', GM),
  tool('portals', 'Portails', 'KeyX', GM),
  tool('obstacles', 'Obstacles', 'KeyW', GM),
  tool('fog', 'Brouillard', 'KeyG', GM),
  tool('lights', 'Lumières', 'KeyL', GM),
  tool('sounds', 'Zones sonores', 'KeyF', GM),
  tool('exploration', 'Exploration', null, GM),
  action('layers.panel', 'Calques', 'KeyK', GM),
  action('grid.toggle', 'Quadrillage', 'KeyQ'),
  action('combat.attack', 'Attaquer', 'KeyY', PLAYING),
  action('presence.cursor', 'Montrer mon curseur', null, PLAYING),
  action('movement-path.toggle', 'Trajets des déplacements', 'Shift+KeyT'),
  action('camera.fit', 'Recadrer la vue', null),
  action('camera.zoom-in', 'Zoomer', 'Char:+'),
  action('camera.zoom-out', 'Dézoomer', 'Char:-'),
  action('fullscreen.toggle', 'Plein écran', null),
  action('fog.cover', 'Tout couvrir de brouillard', null, GM),
  action('fog.reveal', 'Tout découvrir', null, GM),
  action('exploration.toggle', 'Activer ou couper l’exploration', null, GM),
  action('exploration.reset', 'Réinitialiser l’exploration', null, GM),
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
  label: 'Bulle',
  scope: 'table',
  defaultBinding: 'KeyK',
  roles: ['player'],
  late: true,
};
