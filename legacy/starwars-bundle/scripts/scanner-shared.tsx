// Socle commun du Scanner de Fréquences — config PARTAGÉE de la salle (api.sharedState), posée par
// le MJ (scanner-mj.tsx) et lue en temps réel par les joueurs (scanner.tsx). Un seul canal secret à
// la fois. Sérialisé en JSON (le canal partagé ne transporte que des scalaires).
//
// v2 — calage de sinusoïde à TROIS paramètres : trouver la fréquence ne suffit plus (un simple
// balayage de molette révélait le canal en quelques secondes). Le joueur doit superposer SA porteuse
// sur le signal intercepté : fréquence + décalage temporel (phase) + gain (amplitude). Le brouillage
// est hiérarchique : fréquence fausse = illisible ; fréquence bonne mais phase/gain faux = encore
// brouillé (l'intensité plafonne à ~0.45) — seuls les trois réglages alignés déverrouillent le texte.

// Plage volontairement resserrée, par pas de 1 MHz (50 positions) : sur le knob rotatif, chaque
// MHz représente ~29° de rotation — trouvable au geste, là où une plage de 100 MHz au dixième
// demandait une précision au dixième de degré.
export const FREQ_MIN = 100;
export const FREQ_MAX = 150;
export const AMP_MIN = 0.3;
export const AMP_MAX = 1.5;

/** Largeur (en MHz) de la fenêtre autour de la fréquence-cible où le signal commence à émerger. */
export const LOCK_WIDTH = 4;

const SCANNER_KEY = 'scannerChannel';

export interface ScannerConfig {
  /** Fréquence-cible en MHz (dans [FREQ_MIN, FREQ_MAX]) ; null = aucun signal programmé. */
  target: number | null;
  /** Décalage temporel de la porteuse, en fraction de période (0..1). */
  phase: number;
  /** Amplitude de la porteuse (AMP_MIN..AMP_MAX). */
  amplitude: number;
  /** Message révélé une fois la sinusoïde parfaitement calée. */
  message: string;
}

const EMPTY: ScannerConfig = { target: null, phase: 0, amplitude: 1, message: '' };

const clampFreq = (v: number): number => Math.max(FREQ_MIN, Math.min(FREQ_MAX, v));
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const clampAmp = (v: number): number => Math.max(AMP_MIN, Math.min(AMP_MAX, v));

export const parseScannerConfig = (v: unknown): ScannerConfig => {
  if (typeof v !== 'string' || !v) return EMPTY;
  try {
    const raw = JSON.parse(v) as Record<string, unknown>;
    // Arrondi au MHz : le knob joueur avance par pas de 1 — une cible décimale (ancienne config v1)
    // serait mathématiquement inatteignable.
    const target = typeof raw.target === 'number' && !isNaN(raw.target) ? Math.round(clampFreq(raw.target)) : null;
    // Anciennes configs (v1, fréquence seule) : phase 0 / amplitude 1 par défaut — le canal reste
    // déchiffrable, mais exige quand même de caler les nouveaux réglages sur ces valeurs.
    const phase = typeof raw.phase === 'number' && !isNaN(raw.phase) ? clamp01(raw.phase) : 0;
    const amplitude = typeof raw.amplitude === 'number' && !isNaN(raw.amplitude) ? clampAmp(raw.amplitude) : 1;
    const message = typeof raw.message === 'string' ? raw.message : '';
    return { target, phase, amplitude, message };
  } catch {
    return EMPTY;
  }
};

/** intensity 0..1 du brouillage selon l'écart aux TROIS paramètres. Pondération hiérarchique :
 *  - fréquence fausse (hors LOCK_WIDTH) → 1 (bruit total, aucun indice au sweep) ;
 *  - fréquence bonne mais phase/gain quelconques → plancher ~0.45 (texte encore illisible) ;
 *  - verrouillé (< 0.04) seulement quand les trois écarts sont quasi nuls. */
export const scrambleFor = (
  cfg: ScannerConfig,
  freq: number,
  phase: number,
  amplitude: number,
): number => {
  if (cfg.target == null) return 1;
  const df = clamp01(Math.abs(freq - cfg.target) / LOCK_WIDTH);
  // Distance de phase circulaire (0..0.5 de période max) normalisée 0..1.
  const rawDphi = Math.abs(phase - cfg.phase) % 1;
  const dphi = clamp01(Math.min(rawDphi, 1 - rawDphi) / 0.5);
  const da = clamp01(Math.abs(amplitude - cfg.amplitude) / 0.6);
  return clamp01(0.55 * Math.pow(df, 0.8) + 0.30 * dphi + 0.15 * da);
};

export const subscribeScanner = (api: any, cb: (config: ScannerConfig) => void): (() => void) =>
  api.sharedState.subscribe(SCANNER_KEY, (v: unknown) => cb(parseScannerConfig(v)));

export const writeScanner = (api: any, config: ScannerConfig): Promise<void> =>
  api.sharedState.set(SCANNER_KEY, JSON.stringify(config));
