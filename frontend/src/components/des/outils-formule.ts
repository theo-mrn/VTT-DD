/**
 * Réécritures d'une formule de dés pour les commandes du plateau (bonus,
 * avantage, retrait d'un dé). Elles travaillent sur le texte : la formule
 * reste la source de vérité, saisissable à la main à tout moment.
 */
import { normaliserFormule } from '@/lib/jets';

// Bonus fixe en fin de formule (« … + 3 »), seulement après un terme complet :
// dans « 1d6 * -2 », le « -2 » est un facteur, pas un bonus
const BONUS_FINAL = /([\w)!])\s*([+-])\s*(\d+)\s*$/;

/** Bonus fixe final de la formule (0 s'il n'y en a pas). */
export function bonusDe(formule: string): number {
  const m = BONUS_FINAL.exec(formule.trim());
  if (!m) return 0;
  return (m[2] === '-' ? -1 : 1) * Number(m[3]);
}

/** Remplace (ou ajoute, ou retire) le bonus fixe final. */
export function avecBonus(formule: string, bonus: number): string {
  const f = formule.trim();
  const base = BONUS_FINAL.test(f) ? f.replace(BONUS_FINAL, '$1') : f;
  const corps = base || '1d20';
  if (bonus === 0) return corps;
  return `${corps} ${bonus > 0 ? '+' : '-'} ${Math.abs(bonus)}`;
}

export type ModeD20 = 'normal' | 'avantage' | 'desavantage';

// Premier groupe de d20 (« d20 », « 1d20 », « 2d20k1 », « 2d20kl1 »), hors identifiants
const TERME_D20 = /(^|[^\p{L}\p{N}_@])(\d*)d20(kl?\d+)?(?![\d!])/u;

/** Mode du d20 : `2d20k1` est un avantage, `2d20kl1` un désavantage. */
export function modeD20(formule: string): ModeD20 {
  const m = TERME_D20.exec(normaliserFormule(formule));
  if (!m || m[2] !== '2') return 'normal';
  if (m[3] === 'k1') return 'avantage';
  if (m[3] === 'kl1') return 'desavantage';
  return 'normal';
}

const TERMES_MODE: Record<ModeD20, string> = {
  normal: '1d20',
  avantage: '2d20k1',
  desavantage: '2d20kl1',
};

/** Réécrit le d20 selon le mode ; sans d20, l'avantage en ajoute un en tête. */
export function avecModeD20(formule: string, mode: ModeD20): string {
  const f = normaliserFormule(formule);
  const terme = TERMES_MODE[mode];
  if (TERME_D20.test(f)) return f.replace(TERME_D20, `$1${terme}`);
  if (mode === 'normal') return f;
  return f ? `${terme} + ${f}` : terme;
}

/** Nombre de dés de chaque sorte écrits dans la formule (`2d20k1 + 1d6` → d20 : 2, d6 : 1). */
export function compterDes(formule: string): Map<number, number> {
  const compte = new Map<number, number>();
  const motif = /(?<![\p{L}\p{N}_@])(\d*)d(\d+)/gu;
  for (const m of normaliserFormule(formule).matchAll(motif)) {
    const faces = Number(m[2]);
    compte.set(faces, (compte.get(faces) ?? 0) + Number(m[1] || 1));
  }
  return compte;
}

/** Dé principal d'une formule (le premier écrit), pour l'icône d'une macro. */
export function dePrincipal(formule: string): number | null {
  const premier = compterDes(formule).keys().next();
  return premier.done ? null : premier.value;
}

/** Retire un dé : « 3d6 » devient « 2d6 », et « 1d20 + 1d6 » devient « 1d20 ». */
export function retirerDe(formule: string, faces: number): string {
  const f = normaliserFormule(formule);
  const motif = new RegExp(String.raw`(^|[+\-\s])(\d*)d${faces}(?![\d!k])`);
  const m = motif.exec(f);
  if (!m) return f;
  const n = Number(m[2] || 1);
  if (n > 1) return f.replace(motif, `${m[1]}${n - 1}d${faces}`);
  // Dernier dé du groupe : le terme disparaît avec l'opérateur qui le liait
  const sans = f
    .replace(motif, '$1')
    .replace(/([+-])\s*([+-])/g, '$2')
    .replace(/^\s*\+\s*/, '');
  return sansOperateurFinal(sans)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Ajoute un terme à la fin (`+ mod(@FOR)`), ou le pose seul si la formule est vide. */
export function ajouterTerme(formule: string, terme: string): string {
  const f = formule.trim();
  return f ? `${f} + ${terme}` : `1d20 + ${terme}`;
}

/** Opérateur « + » ou « - » laissé en fin de formule : retiré (en temps linéaire). */
function sansOperateurFinal(f: string): string {
  const t = f.trimEnd();
  return t.endsWith('+') || t.endsWith('-') ? t.slice(0, -1) : f;
}
