/**
 * Distance de la visée (docs/combat.md § 12.1, pastille « Viser sur la carte ») : de
 * l'attaquant à chaque cible, centre à centre, écrite comme la distance au clic (unités de la
 * scène, cases selon le comptage de chacun).
 *
 * Aucune fuite : seuls les tokens que je vois comptent ; une cible sans token vu n'a pas de
 * distance.
 */
import type { MapEntity } from '../../engine/entities/entity';
import type { MapEngine } from '../../engine/map-engine';
import { unitContext } from '../measurements/click-distance';
import { distanceText, formatUnits, unitsBetween } from '../measurements/model';
import { measurePrefs } from '../measurements/prefs';
import { characterOf, isToken } from './model';

/** Token vu d'un personnage (le premier posé s'il y en a plusieurs). */
function visibleToken(engine: MapEngine, characterId: string): MapEntity | null {
  for (const e of engine.entities())
    if (isToken(e) && !e.masks.size && characterOf(e) === characterId) return e;
  return null;
}

/**
 * « 6 m · 4 cases » pour une cible, « 3 à 12 m » pour plusieurs ; null si l'attaquant ou
 * aucune cible n'a de token vu.
 */
export function aimDistanceText(
  engine: MapEngine,
  attackerId: string | null,
  targetIds: readonly string[],
): string | null {
  if (!attackerId || !targetIds.length) return null;
  const from = visibleToken(engine, attackerId);
  if (!from) return null;
  const u = unitContext(engine, measurePrefs(engine).getState());
  const targets = targetIds
    .filter((id) => id !== attackerId)
    .map((id) => visibleToken(engine, id))
    .filter((e): e is MapEntity => e !== null);
  if (!targets.length) return null;
  if (targets.length === 1) return distanceText(from.current, targets[0]!.current, u);
  const units = targets.map((e) => unitsBetween(from.current, e.current, u.pixelsPerUnit));
  const min = Math.min(...units);
  const max = Math.max(...units);
  const low = formatUnits(min, u.unitName);
  const high = formatUnits(max, u.unitName);
  return low === high ? high : `${low.replace(` ${u.unitName}`, '')} à ${high}`;
}
