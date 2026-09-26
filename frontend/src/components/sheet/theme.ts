/**
 * Thème de la fiche : les couleurs de `presentation.theme.couleurs` deviennent
 * des variables CSS `--fiche-<nom>` posées sur le cadre de la fiche (et sur
 * ses dialogues), sans toucher au thème global de l'app. Les noms absents
 * reprennent les couleurs de l'app.
 */
import type { Presentation } from '@vtt/rules';
import type { CSSProperties } from 'react';

/** Couleurs de l'app, utilisées quand la présentation n'en déclare pas. */
const APP_COLORS: Record<string, string> = {
  fond: '#0c0c0e',
  fondProfond: '#09090b',
  carte: '#18181b',
  canevas: '#09090b',
  bordure: '#27272a',
  texte: '#e4e4e7',
  texteSecondaire: '#a1a1aa',
  accent: '#c9a965',
  accentSurvol: '#d8bb7a',
};

const toKebab = (name: string) => name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const font = (name: string | undefined, fallback: string) =>
  name ? `"${name.replace(/"/g, '')}", ${fallback}` : fallback;

export function themeVariables(presentation: Presentation): CSSProperties {
  const colors = { ...APP_COLORS, ...(presentation.theme?.couleurs ?? {}) };
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(colors)) vars[`--fiche-${toKebab(name)}`] = value;
  const fonts = presentation.theme?.polices ?? {};
  vars['--fiche-police-corps'] = font(fonts.corps, 'var(--font-modern), ui-sans-serif, system-ui');
  vars['--fiche-police-titres'] = font(fonts.titres, 'var(--font-aclonica), serif');
  return vars as CSSProperties;
}

const loadedFonts = new Set<string>();

/**
 * Charge les polices nommées par la présentation depuis Google Fonts (une
 * fois par nom). Une police absente du catalogue est ignorée : la fiche
 * garde alors la police de repli.
 */
export function loadFonts(presentation: Presentation) {
  if (typeof document === 'undefined') return;
  const p = presentation.theme?.polices ?? {};
  for (const name of [p.corps, p.titres]) {
    if (!name || loadedFonts.has(name)) continue;
    loadedFonts.add(name);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}&display=swap`;
    document.head.appendChild(link);
  }
}
