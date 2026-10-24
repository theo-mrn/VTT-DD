/**
 * Fonctions de la table (rail, dock, raccourcis, adresse, hôte des panneaux, surcouches), une
 * ligne par fonction : retirer une ligne retire la fonction, sa touche, son bouton, son panneau.
 *
 * Une fonction vit dans `features/<id>/index.ts` (son manifeste, un `TableFeature`), avec son
 * interface à côté (`ui/`) ou dans son domaine (`components/<domaine>`). Nom et phrase courte
 * au catalogue : `table.panels.<id>.label` et `.description`. Trois sortes (voir `types.ts`) :
 *
 * ```ts
 * // Un panneau
 * export const notesFeature = {
 *   kind: 'panel', id: 'notes', icon: NotebookPen, roles: ALL_ROLES,
 *   shortcut: { code: 'KeyN', label: 'N' }, width: 'full', mode: 'side',
 *   component: lazy(() => import('./ui/panel').then((m) => ({ default: m.NotesPanel }))),
 * } as const satisfies PanelFeature;
 *
 * // Un bouton qui agit, sans panneau (allumé tant que `useActive` le dit)
 * export const focusFeature = {
 *   kind: 'action', id: 'focus', icon: Eye, roles: ['gm'],
 *   run: ({ panels }) => panels.close(),
 * } as const satisfies ActionFeature;
 * ```
 *
 * Toute fonction peut aussi poser une surcouche toujours montée (`overlay`), au-dessus de la
 * carte, pour tous ceux qui ont son rôle.
 */
import { desFeature } from './des';
import { chatFeature } from './chat';
import { notesFeature } from './notes';
import { documentsFeature } from './documents';
import { progressionFeature } from './progression';
import { joueursFeature } from './joueurs';
import { historiqueFeature } from './historique';
import { sonFeature } from './son';
import { volumeFeature } from './volume';
import { resourcesFeature } from './resources';
import { pnjFeature } from './pnj';
import { rencontresFeature } from './rencontres';
import { scenesFeature } from './scenes';
import { reglagesFeature } from './reglages';
import { randomTablesFeature } from './random-tables';
import { timerFeature } from './timer';
import { pollFeature } from './poll';
import { worldTimeFeature } from './worldTime';
import { safetyFeature } from './safety';
import { spotlightFeature } from './spotlight';
import { clocksFeature } from './clocks';
import { pauseFeature } from './pause';
import { fateFeature } from './fate';
import { groupRollOverlay } from './groupRoll';
import { screenFxOverlay } from './screenFx';
import { automationsFeature } from './automations';

export const tableFeatures = [
  desFeature,
  chatFeature,
  notesFeature,
  documentsFeature,
  progressionFeature,
  joueursFeature,
  historiqueFeature,
  sonFeature,
  volumeFeature,
  resourcesFeature,
  pnjFeature,
  rencontresFeature,
  randomTablesFeature,
  automationsFeature,
  timerFeature,
  worldTimeFeature,
  pollFeature,
  spotlightFeature,
  clocksFeature,
  fateFeature,
  pauseFeature,
  safetyFeature,
  scenesFeature,
  reglagesFeature,
] as const;

/**
 * Surcouches sans bouton de la barre : leur commande vit ailleurs (effets d'écran : menu Météo
 * de la carte ; jet de groupe : bouton « Groupe » du lanceur de dés du MJ), elles jouent chez tous.
 */
export const tableOverlays = [
  { id: 'screenFx', component: screenFxOverlay },
  { id: 'groupRoll', component: groupRollOverlay },
] as const;
