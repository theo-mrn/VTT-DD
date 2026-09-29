/**
 * Points d'échantillon d'une entité (docs/carte.md § 9) : une entité est vue si l'un d'eux l'est.
 * Rendus à plat `[x0, y0, …]`, prêts pour `View.containsAny`.
 */
import type { Vec } from './types.js';

/** Token : centre et 8 points à 0,7 × rayon (tous les 45°, en partant de +x). */
export function sampleCircle(center: Vec, radius: number): Float64Array {
  const out = new Float64Array(18);
  out[0] = center.x;
  out[1] = center.y;
  const r = 0.7 * (Number.isFinite(radius) && radius > 0 ? radius : 0);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    out[2 + 2 * k] = center.x + r * Math.cos(a);
    out[3 + 2 * k] = center.y + r * Math.sin(a);
  }
  return out;
}

/**
 * Objet : centre, 4 coins et 4 milieux des bords du rectangle (x, y) = coin haut gauche avant
 * rotation, tourné de `rotation` degrés autour de son centre (sens horaire à l'écran, comme
 * `transform: rotate()`).
 */
export function sampleRect(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
): Float64Array {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const a = ((Number.isFinite(rotation) ? rotation : 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = width / 2;
  const hh = height / 2;
  // Centre, coins (sens horaire depuis le haut gauche), milieux (haut, droite, bas, gauche).
  const local = [0, 0, -hw, -hh, hw, -hh, hw, hh, -hw, hh, 0, -hh, hw, 0, 0, hh, -hw, 0];
  const out = new Float64Array(18);
  for (let k = 0; k < 9; k++) {
    const lx = local[2 * k]!;
    const ly = local[2 * k + 1]!;
    out[2 * k] = cx + lx * cos - ly * sin;
    out[2 * k + 1] = cy + lx * sin + ly * cos;
  }
  return out;
}
