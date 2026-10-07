/**
 * Qui voit les trajets (docs/carte.md § 10, Trajet des déplacements) :
 *
 * - la **préférence** de chacun (navigateur, activée par défaut), bouton « Trajets » et ⇧T ;
 * - la **règle de la table**, posée par le MJ dans l'affichage de la scène
 *   (`display.movement_paths` : absent, au choix de chacun ; vrai, toujours affichés ; faux,
 *   masqués). Elle s'impose aux joueurs et aux spectateurs ; le MJ garde sa préférence.
 *
 * Couper l'affichage ne coupe pas l'envoi : les autres voient mon trajet selon leur réglage.
 */
import { translate } from '@/i18n/runtime';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { displayOf } from '@/lib/map/engine/planes';

/** Clé de la règle dans l'affichage de la scène (`maps.display`). */
export const RULE_KEY = 'movement_paths';
const PREF_KEY = 'vtt:carte:trajets';

/** Règle de la table : au choix de chacun, toujours affichés, masqués. */
export type TableRule = 'free' | 'shown' | 'hidden';

/** Règles, dans l'ordre du menu ; nom : `map.movementPath.rules.<règle>`. */
export const TABLE_RULES: readonly TableRule[] = ['free', 'shown', 'hidden'];

export interface PathPrefs {
  /** Montrer les trajets sur mon écran. */
  shown: boolean;
}

function readPref(): boolean {
  try {
    return globalThis.localStorage?.getItem(PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

const stores = new WeakMap<MapEngine, StoreApi<PathPrefs>>();

/** Préférence de ce viewer pour ce moteur (relue du navigateur au premier appel). */
export function pathPrefs(engine: MapEngine): StoreApi<PathPrefs> {
  let store = stores.get(engine);
  if (!store) {
    store = createStore<PathPrefs>()(() => ({ shown: readPref() }));
    stores.set(engine, store);
  }
  return store;
}

export function setPathsShown(engine: MapEngine, shown: boolean) {
  pathPrefs(engine).setState({ shown });
  try {
    globalThis.localStorage?.setItem(PREF_KEY, shown ? '1' : '0');
  } catch {
    // Stockage indisponible (navigation privée) : la préférence vaut pour la session
  }
  engine.invalidate();
}

/** Règle de la table, lue dans l'affichage de la scène. */
export function tableRule(scene: { [field: string]: unknown } | null | undefined): TableRule {
  const value = displayOf(scene)[RULE_KEY];
  if (value === true) return 'shown';
  if (value === false) return 'hidden';
  return 'free';
}

/** Règle de la table (MJ) : une commande annulable sur l'affichage de la scène. */
export function setTableRule(engine: MapEngine, rule: TableRule) {
  const scene = engine.store.getState().scene;
  if (!scene || tableRule(scene) === rule) return null;
  const { [RULE_KEY]: _before, ...display } = displayOf(scene);
  return engine.updateScene(translate('map.movementPath.tableRuleCommand'), {
    display: rule === 'free' ? display : { ...display, [RULE_KEY]: rule === 'shown' },
  });
}

/** La règle de la table décide pour ce viewer (joueur ou spectateur, règle posée). */
export function ruleForced(engine: MapEngine, rule: TableRule): boolean {
  return !isGm(engine.viewer) && rule !== 'free';
}

/** Les trajets se dessinent sur mon écran : règle de la table, sinon ma préférence. */
export function pathsShown(engine: MapEngine): boolean {
  const rule = tableRule(engine.store.getState().scene);
  if (ruleForced(engine, rule)) return rule === 'shown';
  return pathPrefs(engine).getState().shown;
}
