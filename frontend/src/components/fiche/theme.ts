/**
 * Thème de la fiche : l'ambiance de la campagne du personnage (globals.css, [data-ambiance]),
 * sinon l'accent déclaré par la présentation de son système (`theme.couleurs`). Les couleurs
 * viennent des données du système, converties en variables HSL du design system : le front
 * n'en code aucune.
 */
import type { Presentation } from '@vtt/rules';
import type { CSSProperties } from 'react';

/** `#rrggbb` (ou `#rgb`, alpha ignoré) en triplet HSL « h s% l% » des variables du thème. */
export function hslTriplet(hex: string): string | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return null;
  let v = m[1]!;
  if (v.length === 3 || v.length === 4) v = [...v.slice(0, 3)].map((c) => c + c).join('');
  if (v.length !== 6 && v.length !== 8) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Variables d'accent tirées de la présentation (`accent`, `accentSurvol`, et `fond` pour le
 * texte posé sur l'accent) ; vide si elle n'en déclare pas.
 */
export function styleThemeSysteme(presentation: Presentation | null | undefined): CSSProperties {
  const couleurs = presentation?.theme?.couleurs ?? {};
  const accent = couleurs.accent ? hslTriplet(couleurs.accent) : null;
  if (!accent) return {};
  const survol = couleurs.accentSurvol ? hslTriplet(couleurs.accentSurvol) : null;
  const fond = couleurs.fondProfond ?? couleurs.fond;
  const surAccent = fond ? hslTriplet(fond) : null;
  return {
    ['--primary' as string]: accent,
    ['--ring' as string]: accent,
    ['--primary-strong' as string]: survol ?? accent,
    ...(surAccent ? { ['--primary-foreground' as string]: surAccent } : {}),
  };
}
