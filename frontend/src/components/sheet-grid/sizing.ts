/**
 * Tailles par défaut des blocs d'après leur contenu (nombre de tuiles, de lignes, longueur
 * du texte) et blocs vides, pour une disposition par défaut sans trou ni ascenseur inutile.
 * Tout se lit dans la fiche calculée et le widget : aucun système n'est connu ici. Un type
 * de bloc sans estimation prend la taille déclarée par sa définition.
 */
import { soldes, type Widget } from '@vtt/rules';
import { blockDefinition } from '@/components/fiche/blocks/registry';
import type { WidgetType } from '@/components/fiche/blocks/types';
import {
  actionsDisponibles,
  estRessource,
  visiblePour,
  type ContexteFiche,
} from '@/components/fiche/widgets';
import {
  clampDefaultHeight,
  heightUnits,
  type BlockSize,
  type GridBlock,
  type HeightMode,
  type MinSizeOf,
  type SizeOf,
} from './model';

/** En-tête (titre) et marges intérieures d'un bloc, en px. */
const CHROME = 49 + 40 + 2;

type Estimation = (ctx: ContexteFiche, widget: never, widthPx: number) => number | null;

/** Clés d'attributs affichées par un bloc d'attributs (liste ou groupe, visibles de l'utilisateur). */
function clesAttributs(ctx: ContexteFiche, w: Extract<Widget, { type: 'attributs' }>): string[] {
  const cles =
    w.attributs ??
    [...ctx.fiche.entite.attributs.values()]
      .filter((a) => a.groupe === w.groupe && a.nature !== 'texte' && a.nature !== 'ressource')
      .map((a) => a.cle);
  return cles.filter((c) => visiblePour(ctx, c));
}

function possessionsListees(ctx: ContexteFiche, sorte: string) {
  return [...ctx.fiche.possessions.values()].filter(
    (p) => p.sorte.id === sorte && (p.rang > 0 || !p.sorte.rangs || p.possession),
  );
}

function texteDe(ctx: ContexteFiche, attribut: string): string {
  const v = ctx.fiche.valeurs.get(attribut)?.valeur;
  return typeof v === 'string' ? v.trim() : '';
}

/** Hauteur du contenu (px, sans le chrome) par type de bloc ; null : taille déclarée. */
const CONTENU: Partial<Record<WidgetType, Estimation>> = {
  attributs: (ctx, w: Extract<Widget, { type: 'attributs' }>, largeur) => {
    const n = clesAttributs(ctx, w).length;
    const colonnes = w.colonnes ?? Math.min(6, n);
    const parLigne = Math.max(1, Math.min(colonnes, Math.floor((largeur - 40 + 8) / (72 + 8))));
    const lignes = Math.max(1, Math.ceil(n / parLigne));
    return lignes * 82 + (lignes - 1) * 8;
  },
  ressources: (ctx, w: Extract<Widget, { type: 'ressources' }>, largeur) => {
    const cles = w.attributs.filter((c) => visiblePour(ctx, c));
    if (w.affichage === 'valeur') {
      // Tuiles de 8 rem au moins, trois par ligne au plus
      const parLigne = Math.max(1, Math.min(3, cles.length, Math.floor((largeur - 40) / 136)));
      const lignes = Math.max(1, Math.ceil(cles.length / parLigne));
      return lignes * 66 + (lignes - 1) * 8;
    }
    const n = Math.max(1, cles.filter((c) => estRessource(ctx, c)).length);
    return n * 38 + (n - 1) * 16;
  },
  possessions: (ctx, w: Extract<Widget, { type: 'possessions' }>) => {
    const liste = possessionsListees(ctx, w.sorte);
    const groupes = w.groupeChamp
      ? new Set(liste.map((p) => String(p.entree.champs[w.groupeChamp!] ?? ''))).size
      : 0;
    return Math.max(1, liste.length) * 37 + groupes * 34;
  },
  monnaies: (ctx) => {
    const n = Math.max(1, soldes(ctx.fiche).length);
    return n * 72 + (n - 1) * 16;
  },
  actions: (ctx, w: Extract<Widget, { type: 'actions' }>, largeur) => {
    const n = Math.max(1, actionsDisponibles(ctx, w.actions).length);
    const lignes = Math.ceil(n / (largeur >= 480 ? 2 : 1));
    return lignes * 58 + (lignes - 1) * 8;
  },
  texte: (ctx, w: Extract<Widget, { type: 'texte' }>, largeur) => {
    const parLigne = Math.max(20, (largeur - 40) / 7.5);
    const lignes = texteDe(ctx, w.attribut)
      .split('\n')
      .reduce((s, p) => s + Math.max(1, Math.ceil(p.length / parLigne)), 0);
    return Math.max(1, lignes) * 23;
  },
  bonus: (ctx) => {
    const n =
      ctx.fiche.etat.bonus.length + ctx.fiche.sources.filter((s) => s.genre !== 'bonus').length;
    return Math.max(80, 56 + n * 52);
  },
  details: () => 120,
};

/**
 * Blocs sans rien à montrer : cachés en lecture (la grille se resserre), montrés en
 * personnalisation. Un type absent d'ici n'est jamais caché : il affiche son état vide.
 */
const VIDE: Partial<Record<WidgetType, (ctx: ContexteFiche, widget: never) => boolean>> = {
  attributs: (ctx, w: Extract<Widget, { type: 'attributs' }>) => clesAttributs(ctx, w).length === 0,
  ressources: (ctx, w: Extract<Widget, { type: 'ressources' }>) =>
    !w.attributs.some((c) => visiblePour(ctx, c) && ctx.fiche.valeurs.has(c)),
  possessions: (ctx, w: Extract<Widget, { type: 'possessions' }>) =>
    !ctx.systeme.sortes.has(w.sorte) || possessionsListees(ctx, w.sorte).length === 0,
  monnaies: (ctx) => soldes(ctx.fiche).length === 0,
  actions: (ctx, w: Extract<Widget, { type: 'actions' }>) =>
    !ctx.operations || actionsDisponibles(ctx, w.actions).length === 0,
  texte: (ctx, w: Extract<Widget, { type: 'texte' }>) => texteDe(ctx, w.attribut) === '',
};

/** Le bloc n'a rien à montrer (vrai seulement pour les types qui savent le dire). */
export function isBlockEmpty(ctx: ContexteFiche, widget: Widget): boolean {
  const vide = VIDE[widget.type];
  return vide ? vide(ctx, widget as never) : false;
}

/** Taille par défaut d'un bloc de largeur `widthPx` : largeur déclarée, hauteur estimée. */
export function sizeFor(ctx: ContexteFiche): SizeOf {
  return (block, _bp, widthPx) => {
    if (!block.widget) return { w: 6, h: 3 };
    const def = blockDefinition(block.widget.type);
    const contenu = CONTENU[block.widget.type]?.(ctx, block.widget as never, widthPx) ?? null;
    const h =
      contenu === null
        ? def.defaultSize.h
        : clampDefaultHeight(heightUnits(CHROME + contenu), def.minSize.h);
    return { w: def.defaultSize.w, h };
  };
}

export const minSizeOf: MinSizeOf = (block: GridBlock): BlockSize =>
  block.widget ? blockDefinition(block.widget.type).minSize : { w: 3, h: 2 };

/**
 * Hauteur d'un bloc : `auto` suit son contenu mesuré (pas de poignée verticale), `fixed`
 * garde la hauteur réglée et fait défiler le contenu. Choix du bloc, sinon celui de son type.
 */
export function heightModeOf(block: GridBlock): HeightMode {
  if (block.height) return block.height;
  if (!block.widget) return 'auto';
  return blockDefinition(block.widget.type).defaultHeight ?? 'auto';
}
