/**
 * Thème de la fiche : les couleurs de `presentation.theme.couleurs` deviennent
 * des variables CSS `--fiche-<nom>` posées sur le cadre de la fiche (et sur
 * ses dialogues), sans toucher au thème global de l'app. Les noms absents
 * reprennent les couleurs de l'app.
 */
import type { Presentation } from '@vtt/rules';
import type { CSSProperties } from 'react';

/** Couleurs de l'app, utilisées quand la présentation n'en déclare pas. */
const COULEURS_APP: Record<string, string> = {
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

const enKebab = (nom: string) => nom.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

const police = (nom: string | undefined, repli: string) =>
  nom ? `"${nom.replace(/"/g, '')}", ${repli}` : repli;

export function variablesTheme(presentation: Presentation): CSSProperties {
  const couleurs = { ...COULEURS_APP, ...(presentation.theme?.couleurs ?? {}) };
  const vars: Record<string, string> = {};
  for (const [nom, valeur] of Object.entries(couleurs)) vars[`--fiche-${enKebab(nom)}`] = valeur;
  const polices = presentation.theme?.polices ?? {};
  vars['--fiche-police-corps'] = police(
    polices.corps,
    'var(--font-modern), ui-sans-serif, system-ui',
  );
  vars['--fiche-police-titres'] = police(polices.titres, 'var(--font-aclonica), serif');
  return vars as CSSProperties;
}

const chargees = new Set<string>();

/**
 * Charge les polices nommées par la présentation depuis Google Fonts (une
 * fois par nom). Une police absente du catalogue est ignorée : la fiche
 * garde alors la police de repli.
 */
export function chargerPolices(presentation: Presentation) {
  if (typeof document === 'undefined') return;
  const p = presentation.theme?.polices ?? {};
  for (const nom of [p.corps, p.titres]) {
    if (!nom || chargees.has(nom)) continue;
    chargees.add(nom);
    const lien = document.createElement('link');
    lien.rel = 'stylesheet';
    lien.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(nom)}&display=swap`;
    document.head.appendChild(lien);
  }
}
