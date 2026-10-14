/**
 * Styles d'export d'une fiche : même mise en page, habillage différent.
 * - `classic` : l'allure des fiches officielles de D&D (parchemin, encre brune, rouge sombre,
 *   caractéristiques en médaillons, titres en petites capitales) ;
 * - `neutral` : noir sur blanc, filets fins, pensée pour l'impression ;
 * - `yner` : les couleurs du site (fond sombre, or).
 * Polices standard du PDF (aucun téléchargement) : Times pour le classique, Helvetica sinon.
 */
export type SheetStyle = 'classic' | 'neutral' | 'yner';
export const SHEET_STYLES: readonly SheetStyle[] = ['classic', 'neutral', 'yner'];

export interface PdfTheme {
  page: string;
  ink: string;
  muted: string;
  accent: string;
  /** Fond des cases (caractéristiques, ressources). */
  box: string;
  boxBorder: string;
  rule: string;
  font: string;
  bold: string;
  italic: string;
  /** Rayon des cases. */
  radius: number;
  /** Titres de section en capitales espacées. */
  caps: boolean;
  /** Cadre double autour de l'en-tête (fiche officielle). */
  ornate: boolean;
}

export const PDF_THEMES: Record<SheetStyle, PdfTheme> = {
  classic: {
    page: '#f3e9d2',
    ink: '#2b1d0e',
    muted: '#6b5434',
    accent: '#7b1e1e',
    box: '#fbf5e6',
    boxBorder: '#8b6b3d',
    rule: '#b89a6a',
    font: 'Times-Roman',
    bold: 'Times-Bold',
    italic: 'Times-Italic',
    radius: 8,
    caps: true,
    ornate: true,
  },
  neutral: {
    page: '#ffffff',
    ink: '#111111',
    muted: '#666666',
    accent: '#111111',
    box: '#ffffff',
    boxBorder: '#9a9a9a',
    rule: '#c8c8c8',
    font: 'Helvetica', // i18n-ignore
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    radius: 3,
    caps: true,
    ornate: false,
  },
  yner: {
    page: '#121214',
    ink: '#f2efe8',
    muted: '#a39e94',
    accent: '#d4b06a',
    box: '#1c1c20',
    boxBorder: '#34343b',
    rule: '#2c2c32',
    font: 'Helvetica', // i18n-ignore
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    radius: 6,
    caps: false,
    ornate: false,
  },
};

/** Couleurs des aperçus de la fenêtre d'export (page, encre, accent, case). */
export const STYLE_SWATCH: Record<SheetStyle, [string, string, string, string]> = {
  classic: ['#f3e9d2', '#2b1d0e', '#7b1e1e', '#8b6b3d'],
  neutral: ['#ffffff', '#111111', '#111111', '#9a9a9a'],
  yner: ['#121214', '#f2efe8', '#d4b06a', '#34343b'],
};
