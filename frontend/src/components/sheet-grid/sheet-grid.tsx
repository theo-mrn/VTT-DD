'use client';

/**
 * Grille de la fiche d'un personnage (react-grid-layout) : blocs du registre placés selon la
 * mise en page du personnage, ou la disposition par défaut tirée de la présentation.
 *
 * - Lecture : blocs fixes ; ceux qui n'ont rien à montrer sont retirés et la grille se resserre.
 * - Personnalisation (droit `layout` renvoyé par le service) : déplacer (souris, tactile ou
 *   clavier), redimensionner, ajouter (sélecteur), retirer, réinitialiser. Chaque changement
 *   est montré tout de suite et enregistré peu après par le service character (version,
 *   conflits) : la mise en page appartient au personnage, toute la table la voit.
 *
 * La largeur est celle du conteneur (la fiche vit aussi dans un panneau de la table), mesurée
 * en continu : pas de WidthProvider, qui n'écoute que la fenêtre.
 */
import { useTranslations } from 'next-intl';
import { erreursWidget, type Widget } from '@vtt/rules';
import { Check, CloudOff, LayoutGrid, Loader2, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Responsive, type Layout } from 'react-grid-layout';
import { toast } from 'sonner';
import type { ContexteFiche } from '@/components/fiche/widgets';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TileArrangement } from '@/components/fiche/blocks/tiles/model';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError, messageErreur } from '@/lib/api';
import type { SheetBreakpoint, SheetLayout, SheetLayoutItem } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { BlockFrame } from './block-frame';
import { BlockPicker } from './block-picker';
import { defaultWidgets } from './candidates';
import {
  BREAKPOINT_ORDER,
  BREAKPOINTS,
  COLUMNS,
  MARGIN,
  MAX_BLOCKS,
  ROW_HEIGHT,
  blockWidthPx,
  breakpointFor,
  cleanItems,
  gridBlock,
  heightUnits,
  newBlockId,
  pack,
  scaleMin,
  scaleWidth,
  stateFrom,
  toApiLayout,
  type GridLayouts,
  type GridState,
  type HeightMode,
} from './model';
import { heightModeOf, isBlockEmpty, minSizeOf, sizeFor } from './sizing';
import './sheet-grid.css';

/** Délai avant d'enregistrer une série de changements (déplacements successifs). */
const DELAI_ENREGISTREMENT = 700;

type Statut = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Rappels d'un bloc, liés à son id. */
interface RappelsBloc {
  onMeasure: (px: number) => void;
  onHeightModeChange: (mode: HeightMode) => void;
  onArrangementChange: (arrangement: TileArrangement | undefined) => void;
  onWidgetChange: (widget: Widget) => void;
  onRemove: () => void;
}

/** Compactage vertical : chaque bloc remonte au plus haut sans chevaucher ceux placés avant. */
function compact(items: SheetLayoutItem[]): SheetLayoutItem[] {
  const places: SheetLayoutItem[] = [];
  const chevauche = (a: SheetLayoutItem, b: SheetLayoutItem) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const courant = { ...it, y: 0 };
    // Saute sous le bloc qui gêne (pas fin de 4 px : pas de descente rangée par rangée)
    for (
      let g = places.find((p) => chevauche(courant, p));
      g;
      g = places.find((p) => chevauche(courant, p))
    )
      courant.y = g.y + g.h;
    places.push(courant);
  }
  const ordre = new Map(items.map((it, i) => [it.i, i]));
  return places.sort((a, b) => ordre.get(a.i)! - ordre.get(b.i)!);
}

/** Pas d'un redimensionnement vertical au clavier (unités de 4 px : 24 px). */
const PAS_CLAVIER = 6;

const recouvreX = (a: SheetLayoutItem, b: SheetLayoutItem) => a.x < b.x + b.w && b.x < a.x + a.w;

/** Bloc agrandi ou réduit d'un pas au clavier (largeur à droite et à gauche, hauteur en bas et en haut). */
function redimensionne(
  it: SheetLayoutItem,
  touche: string,
  cols: number,
  min: { w: number; h: number },
): SheetLayoutItem {
  const suivant = { ...it };
  if (touche === 'ArrowRight') suivant.w = Math.min(cols - it.x, it.w + 1);
  if (touche === 'ArrowLeft') suivant.w = Math.max(min.w, it.w - 1);
  if (touche === 'ArrowDown') suivant.h = Math.min(2400, it.h + PAS_CLAVIER);
  if (touche === 'ArrowUp') suivant.h = Math.max(min.h, it.h - PAS_CLAVIER);
  return suivant;
}

/** Bloc échangé avec son voisin du dessous ou du dessus dans ses colonnes ; sans voisin : null. */
function echangeVertical(
  it: SheetLayoutItem,
  autres: SheetLayoutItem[],
  bas: boolean,
): SheetLayoutItem[] | null {
  if (bas) {
    // Passe sous le premier bloc qui le suit dans ses colonnes
    const dessous = autres
      .filter((o) => recouvreX(o, it) && o.y >= it.y + it.h)
      .sort((a, b) => a.y - b.y)[0];
    if (!dessous) return null;
    return [
      ...autres.map((o) => (o.i === dessous.i ? { ...o, y: it.y } : o)),
      { ...it, y: dessous.y + dessous.h },
    ];
  }
  // Passe au-dessus du bloc qui le précède dans ses colonnes
  const dessus = autres
    .filter((o) => recouvreX(o, it) && o.y + o.h <= it.y)
    .sort((a, b) => b.y - a.y)[0];
  if (!dessus) return null;
  return [
    ...autres.map((o) => (o.i === dessus.i ? { ...o, y: dessus.y + it.h } : o)),
    { ...it, y: dessus.y },
  ];
}

/** Déplacement ou redimensionnement d'un bloc au clavier, dans une disposition. */
function auClavier(
  items: SheetLayoutItem[],
  id: string,
  touche: string,
  agrandir: boolean,
  cols: number,
  min: { w: number; h: number },
  /** Hauteur suivie du contenu : seule la largeur se règle. */
  hauteurAuto: boolean,
): SheetLayoutItem[] | null {
  const it = items.find((x) => x.i === id);
  if (!it) return null;
  const autres = items.filter((x) => x.i !== id);
  const vertical = touche === 'ArrowDown' || touche === 'ArrowUp';
  if (agrandir) {
    if (hauteurAuto && vertical) return null;
    return compact([...autres, redimensionne(it, touche, cols, min)]);
  }
  if (touche === 'ArrowRight' || touche === 'ArrowLeft') {
    const x = Math.max(0, Math.min(cols - it.w, it.x + (touche === 'ArrowRight' ? 1 : -1)));
    return compact([...autres, { ...it, x }]);
  }
  if (!vertical) return null;
  const echange = echangeVertical(it, autres, touche === 'ArrowDown');
  return echange && compact(echange);
}

function memePositions(a: SheetLayoutItem[], b: SheetLayoutItem[]) {
  const cle = (l: SheetLayoutItem[]) =>
    JSON.stringify(
      [...l].sort((x, y) => x.i.localeCompare(y.i)).map((x) => [x.i, x.x, x.y, x.w, x.h]),
    );
  return cle(a) === cle(b);
}

export function SheetGrid({
  ctx,
  layout,
  editing,
  onEditingChange,
  onSave,
}: Readonly<{
  ctx: ContexteFiche;
  /** Mise en page enregistrée ; null : disposition par défaut de la présentation. */
  layout: SheetLayout | null;
  /** Personnalisation en cours (seulement si l'utilisateur en a le droit). */
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  /** Enregistre la mise en page (null : retour à la disposition par défaut). */
  onSave: (layout: SheetLayout | null) => Promise<unknown>;
}>) {
  const t = useTranslations();
  // ─── Largeur du conteneur ────────────────────────────────────────────────
  const conteneur = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = conteneur.current;
    if (!el) return;
    // Une mesure par image au plus : un panneau qui s'ouvre redimensionne à chaque pixel
    let image = 0;
    let derniere = 0;
    const obs = new ResizeObserver(([e]) => {
      const w = Math.floor(e!.contentRect.width);
      // Panneau fermé (contenu sauté, largeur 0) : la grille garde sa dernière largeur
      if (w === 0 && derniere > 0) return;
      derniere = w;
      if (image) return;
      image = requestAnimationFrame(() => {
        image = 0;
        setLargeur(derniere);
      });
    });
    obs.observe(el);
    setLargeur(Math.floor(el.getBoundingClientRect().width));
    return () => {
      obs.disconnect();
      cancelAnimationFrame(image);
    };
  }, []);
  const bp = breakpointFor(largeur);

  // ─── Mise en page : enregistrée, ou brouillon pendant la personnalisation ──
  // Une écriture sur la fiche change `ctx` : la mise en page n'est recalculée que si elle
  // change, ou ses règles. Les tailles estimées lisent la fiche du moment (blocs ajoutés,
  // positions à compléter) ; affichés, les blocs en hauteur automatique sont mesurés.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const sizeOf = useMemo<ReturnType<typeof sizeFor>>(
    () => (block, cle, px) => sizeFor(ctxRef.current)(block, cle, px),
    [],
  );
  const { systeme } = ctx;
  const type = ctx.fiche.etat.type;
  // Disposition par défaut (sans mise en page enregistrée) : gardée tant que ses blocs ne
  // changent pas (ceux déduits de la fiche suivent les sortes possédées)
  const defautsCalcules = useMemo(() => (layout ? null : defaultWidgets(ctx)), [layout, ctx]);
  const cleDefauts = defautsCalcules ? JSON.stringify(defautsCalcules) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defauts = useMemo(() => defautsCalcules ?? [], [cleDefauts]);
  const serveur = useMemo(
    () =>
      stateFrom(
        layout,
        () => defauts.map((w, i) => gridBlock(`p${i + 1}`, w)),
        sizeOf,
        minSizeOf,
        // Bloc enregistré qui vise un attribut ou une sorte retirés des règles : indisponible
        (w) => erreursWidget(systeme, type, w).length === 0,
      ),
    [layout, defauts, systeme, type, sizeOf],
  );
  const [brouillon, setBrouillon] = useState<GridState | null>(null);
  const etat = editing && brouillon ? brouillon : serveur;
  /** Message lu par les lecteurs d'écran après une action au clavier. */
  const [annonce, setAnnonce] = useState('');

  // ─── Enregistrement différé ───────────────────────────────────────────────
  const [statut, setStatut] = useState<Statut>('idle');
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aEnregistrer = useRef<SheetLayout | null | undefined>(undefined);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const envoyer = useCallback(async () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
    const l = aEnregistrer.current;
    if (l === undefined) return;
    aEnregistrer.current = undefined;
    setStatut('saving');
    try {
      await onSaveRef.current(l).catch(async (e: unknown) => {
        // La fiche a changé ailleurs (PV modifiés par le MJ…) : elle vient d'être relue, et
        // la mise en page est celle que l'utilisateur est en train de composer : on réessaie
        if (e instanceof ApiError && e.status === 409) return onSaveRef.current(l);
        throw e;
      });
      if (aEnregistrer.current === undefined) setStatut('saved');
    } catch (e) {
      setStatut('error');
      toast.error(t('sheet.grid.notSaved', { error: messageErreur(e) }));
    }
  }, []);

  const planifier = useCallback(
    (l: SheetLayout | null, immediat = false) => {
      aEnregistrer.current = l;
      setStatut('pending');
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => void envoyer(), immediat ? 0 : DELAI_ENREGISTREMENT);
    },
    [envoyer],
  );

  // Rien ne se perd en quittant la page : l'enregistrement en attente part tout de suite
  useEffect(() => () => void envoyer(), [envoyer]);

  // Entrée en personnalisation : on part de ce qui est enregistré ; en sortant, le
  // brouillon est enregistré et oublié (la fiche relue fait foi)
  useEffect(() => {
    if (editing) setBrouillon((b) => b ?? serveur);
    else {
      void envoyer();
      setBrouillon(null);
    }
  }, [editing, serveur, envoyer]);

  const changer = useCallback(
    (suivant: GridState) => {
      setBrouillon(suivant);
      planifier(toApiLayout(suivant));
    },
    [planifier],
  );

  const terminer = useCallback(() => {
    void envoyer();
    setStatut('idle');
    onEditingChange(false);
  }, [envoyer, onEditingChange]);

  // ─── Blocs affichés ────────────────────────────────────────────────────────
  // Blocs vides : relus à chaque écriture, mais l'ensemble garde son identité tant qu'il ne
  // change pas (la grille ne se recompose pas pour rien)
  const idsVides = useMemo(
    () =>
      etat.blocks
        .filter((b) => b.widget && isBlockEmpty(ctx, b.widget))
        .map((b) => b.id)
        .join('\n'),
    [etat.blocks, ctx],
  );
  const vides = useMemo(() => new Set(idsVides ? idsVides.split('\n') : []), [idsVides]);
  const visibles = useMemo(
    () => (editing ? etat.blocks : etat.blocks.filter((b) => b.widget && !vides.has(b.id))),
    [editing, etat.blocks, vides],
  );
  const modes = useMemo(
    () => new Map(etat.blocks.map((b) => [b.id, heightModeOf(b)])),
    [etat.blocks],
  );
  /** Hauteur (rangées) mesurée du contenu des blocs en hauteur automatique. */
  const [mesures, setMesures] = useState<Record<string, number>>({});
  const mesurer = useCallback((id: string, px: number) => {
    if (px <= 0) return;
    const h = heightUnits(px);
    setMesures((m) => (m[id] === h ? m : { ...m, [id]: h }));
  }, []);
  const layouts = useMemo(() => {
    const ids = new Set(visibles.map((b) => b.id));
    const parId = new Map(etat.blocks.map((b) => [b.id, b]));
    const r = {} as Record<SheetBreakpoint, Layout[]>;
    for (const cle of BREAKPOINT_ORDER) {
      r[cle] = etat.layouts[cle]
        .filter((it) => ids.has(it.i))
        .map((it) => {
          const min = scaleMin(minSizeOf(parId.get(it.i)!), cle);
          if (modes.get(it.i) === 'auto') {
            // La hauteur suit le contenu ; la compaction verticale remonte les blocs du dessous
            const h = mesures[it.i] ?? it.h;
            return {
              ...it,
              h,
              minW: Math.min(min.w, it.w),
              minH: h,
              maxH: h,
              resizeHandles: ['e'],
            } satisfies Layout;
          }
          return {
            ...it,
            minW: Math.min(min.w, it.w),
            minH: Math.min(min.h, it.h),
            resizeHandles: ['se'],
          } satisfies Layout;
        });
    }
    return r;
  }, [etat.layouts, etat.blocks, visibles, modes, mesures]);

  // ─── Changements ───────────────────────────────────────────────────────────
  const appliquerPositions = useCallback(
    (items: readonly Layout[]) => {
      if (!brouillon) return;
      const propres = cleanItems(items as SheetLayoutItem[]);
      if (memePositions(propres, brouillon.layouts[bp])) return;
      changer({
        ...brouillon,
        layouts: { ...brouillon.layouts, [bp]: propres },
        arranged: brouillon.arranged.includes(bp)
          ? brouillon.arranged
          : [...brouillon.arranged, bp],
      });
    },
    [brouillon, bp, changer],
  );

  /** Hauteur automatique ou définie ; un bloc qui passe en définie garde la hauteur affichée. */
  const changerHauteur = useCallback(
    (id: string, mode: HeightMode) => {
      if (!brouillon) return;
      const affiche = layouts[bp].find((it) => it.i === id);
      changer({
        ...brouillon,
        blocks: brouillon.blocks.map((b) => (b.id === id ? { ...b, height: mode } : b)),
        layouts: {
          ...brouillon.layouts,
          [bp]: brouillon.layouts[bp].map((it) =>
            it.i === id && affiche ? { ...it, h: affiche.h } : it,
          ),
        },
        arranged: brouillon.arranged.includes(bp)
          ? brouillon.arranged
          : [...brouillon.arranged, bp],
      });
      setAnnonce(mode === 'auto' ? t('sheet.grid.heightAuto') : t('sheet.grid.heightFixed'));
    },
    [brouillon, layouts, bp, changer],
  );

  /** Disposition interne d'un bloc de tuiles ; la hauteur automatique suit d'elle-même. */
  const changerDisposition = useCallback(
    (id: string, arrangement: TileArrangement | undefined) => {
      if (!brouillon) return;
      changer({
        ...brouillon,
        blocks: brouillon.blocks.map((b) => {
          if (b.id !== id) return b;
          const { arrangement: _ancienne, ...reste } = b;
          return arrangement ? { ...reste, arrangement } : reste;
        }),
      });
      if (!arrangement) setAnnonce(t('sheet.grid.layoutRestored'));
    },
    [brouillon, changer],
  );

  /** Valeurs ajoutées ou retirées d'un bloc de tuiles : le bloc affiche le nouveau widget. */
  const changerWidget = useCallback(
    (id: string, widget: Widget) => {
      if (!brouillon) return;
      changer({
        ...brouillon,
        blocks: brouillon.blocks.map((b) => (b.id === id ? { ...b, widget } : b)),
      });
    },
    [brouillon, changer],
  );

  const retirer = useCallback(
    (id: string) => {
      if (!brouillon) return;
      const layoutsSans = {} as GridLayouts;
      for (const cle of BREAKPOINT_ORDER)
        layoutsSans[cle] = compact(brouillon.layouts[cle].filter((it) => it.i !== id));
      changer({
        ...brouillon,
        blocks: brouillon.blocks.filter((b) => b.id !== id),
        layouts: layoutsSans,
      });
      setAnnonce(t('sheet.grid.removed'));
    },
    [brouillon, changer],
  );

  const ajouter = useCallback(
    (w: Widget) => {
      if (!brouillon) return;
      if (brouillon.blocks.length >= MAX_BLOCKS) {
        toast.error(t('sheet.grid.max', { max: MAX_BLOCKS }));
        return;
      }
      const bloc = gridBlock(newBlockId(brouillon.blocks), w);
      const suivants = {} as GridLayouts;
      for (const cle of BREAKPOINT_ORDER) {
        const cols = COLUMNS[cle];
        const min = minSizeOf(bloc);
        const taille = sizeOf(bloc, 'lg', blockWidthPx(6, 'lg'));
        const largeurBloc = scaleWidth(taille.w, cle, min.w);
        const h = sizeOf(bloc, cle, blockWidthPx(largeurBloc, cle)).h;
        const bas = brouillon.layouts[cle].reduce((m, it) => Math.max(m, it.y + it.h), 0);
        const [place] = pack([{ i: bloc.id, w: largeurBloc, h }], cols);
        suivants[cle] = [...brouillon.layouts[cle], { ...place!, y: bas }];
      }
      changer({ ...brouillon, blocks: [...brouillon.blocks, bloc], layouts: suivants });
      setAnnonce(t('sheet.grid.added', { name: w.titre }));
      // Le nouveau bloc est amené à l'écran, prêt à être placé au clavier
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(`[data-sheet-block="${bloc.id}"]`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el?.focus({ preventScroll: true });
        }),
      );
    },
    [brouillon, changer, sizeOf],
  );

  const [confirmation, setConfirmation] = useState(false);
  const reinitialiser = useCallback(() => {
    const defaut = stateFrom(
      null,
      () => defaultWidgets(ctx).map((w, i) => gridBlock(`p${i + 1}`, w)),
      sizeOf,
      minSizeOf,
    );
    setBrouillon(defaut);
    planifier(null, true);
    setConfirmation(false);
    setAnnonce(t('sheet.grid.defaultRestored'));
  }, [ctx, sizeOf, planifier]);

  // ─── Clavier ───────────────────────────────────────────────────────────────
  const surTouche = useCallback(
    (id: string, e: KeyboardEvent<HTMLDivElement>) => {
      if (!brouillon || e.target !== e.currentTarget) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        retirer(id);
        return;
      }
      if (!e.key.startsWith('Arrow')) return; // i18n-ignore
      e.preventDefault();
      const bloc = brouillon.blocks.find((b) => b.id === id);
      if (!bloc) return;
      // Positions affichées : hauteurs mesurées des blocs automatiques comprises
      const items = auClavier(
        cleanItems(layouts[bp] as SheetLayoutItem[]),
        id,
        e.key,
        e.shiftKey,
        COLUMNS[bp],
        scaleMin(minSizeOf(bloc), bp),
        modes.get(id) === 'auto',
      );
      if (!items || memePositions(items, brouillon.layouts[bp])) return;
      appliquerPositions(items);
      const it = items.find((x) => x.i === id)!;
      setAnnonce(
        e.shiftKey
          ? t('sheet.grid.size', { columns: it.w, height: it.h * ROW_HEIGHT - MARGIN })
          : t('sheet.grid.position', { column: it.x + 1, row: it.y + 1 }),
      );
    },
    [brouillon, bp, retirer, appliquerPositions, modes, layouts],
  );

  // Rappels de chaque bloc, stables d'un rendu à l'autre (le cadre est mémoïsé) : ils
  // appellent la dernière version des actions
  const actions = useRef({ mesurer, changerHauteur, changerDisposition, changerWidget, retirer });
  actions.current = { mesurer, changerHauteur, changerDisposition, changerWidget, retirer };
  const rappels = useRef(new Map<string, RappelsBloc>());
  const rappelsDe = (id: string): RappelsBloc => {
    let r = rappels.current.get(id);
    if (!r) {
      r = {
        onMeasure: (px) => actions.current.mesurer(id, px),
        onHeightModeChange: (m) => actions.current.changerHauteur(id, m),
        onArrangementChange: (a) => actions.current.changerDisposition(id, a),
        onWidgetChange: (w) => actions.current.changerWidget(id, w),
        onRemove: () => actions.current.retirer(id),
      };
      rappels.current.set(id, r);
    }
    return r;
  };

  const [selecteur, setSelecteur] = useState(false);
  const presents = useMemo(
    () => etat.blocks.map((b) => b.widget).filter((w): w is Widget => w !== null),
    [etat.blocks],
  );

  return (
    <div className="space-y-4">
      {editing && (
        <div
          role="toolbar"
          aria-label={t('sheet.grid.customizing')}
          className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-popover/95 px-3 py-2 shadow-elevated backdrop-blur"
        >
          <LayoutGrid className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('sheet.grid.customization')}</p>
            <p className="hidden text-xs text-muted-foreground md:block">
              {t.rich('sheet.grid.editHint', {
                arrows: () => <Kbd>←↑→↓</Kbd>,
                shift: () => <Kbd>{t('chat.shiftKey')}</Kbd>,
                del: () => <Kbd>{t('sheet.inventory.delKey')}</Kbd>,
              })}
            </p>
          </div>
          <StatutEnregistrement statut={statut} />
          <Button variant="secondary" size="sm" onClick={() => setSelecteur(true)}>
            <Plus />
            {t('sheet.grid.addBlock')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmation(true)}>
            <RotateCcw />
            {t('audio.mixer.reset')}
          </Button>
          <Button size="sm" onClick={terminer}>
            <Check />
            {t('combat.attack.finish')}
          </Button>
        </div>
      )}

      <div ref={conteneur} className="min-w-0">
        {largeur === 0 && (
          <div className="grid gap-4 md:grid-cols-2" aria-busy aria-label={t('sheet.grid.layout')}>
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        )}
        {largeur > 0 && visibles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-muted-foreground">
            {editing ? t('sheet.grid.emptyEditing') : t('sheet.grid.empty')}
          </div>
        )}
        {largeur > 0 && visibles.length > 0 && (
          <Responsive
            className={cn('sheet-grid', editing && 'sheet-grid-editing')}
            width={largeur}
            breakpoints={BREAKPOINTS}
            cols={COLUMNS}
            layouts={layouts}
            rowHeight={ROW_HEIGHT}
            // Pas d'espace entre rangées : chaque cadre porte sa marge basse (MARGIN)
            margin={[MARGIN, 0]}
            containerPadding={[0, 0]}
            compactType="vertical"
            isDraggable={editing}
            isResizable={editing}
            resizeHandles={['se']}
            draggableHandle=".sheet-drag-handle"
            draggableCancel=".sheet-no-drag"
            onDragStop={(l) => appliquerPositions(l)}
            onResizeStop={(l) => appliquerPositions(l)}
          >
            {visibles.map((b) => {
              const titre = b.widget?.titre ?? b.raw.title;
              return (
                <div
                  key={b.id}
                  data-sheet-block={b.id}
                  tabIndex={editing ? 0 : undefined}
                  role={editing ? 'group' : undefined}
                  aria-roledescription={editing ? t('sheet.grid.movableBlock') : undefined}
                  aria-label={editing ? t('sheet.grid.blockKeys', { name: titre }) : undefined}
                  onKeyDown={editing ? (e) => surTouche(b.id, e) : undefined}
                  className="group/bloc outline-none"
                >
                  <BlockFrame
                    block={b}
                    ctx={ctx}
                    editing={editing}
                    empty={vides.has(b.id)}
                    heightMode={modes.get(b.id) ?? 'auto'}
                    {...rappelsDe(b.id)}
                  />
                </div>
              );
            })}
          </Responsive>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {annonce}
      </p>

      {editing && (
        <BlockPicker
          ctx={ctx}
          present={presents}
          open={selecteur}
          onOpenChange={setSelecteur}
          onPick={ajouter}
        />
      )}

      <Dialog open={confirmation} onOpenChange={setConfirmation}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('sheet.grid.resetTitle')}</DialogTitle>
            <DialogDescription>{t('sheet.grid.resetHint')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmation(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button variant="destructive" onClick={reinitialiser}>
              <RotateCcw />
              {t('audio.mixer.reset')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatutEnregistrement({ statut }: Readonly<{ statut: Statut }>) {
  const t = useTranslations();
  if (statut === 'idle') return null;
  let contenu = (
    <>
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      {t('common.states.saving')}
    </>
  );
  if (statut === 'error')
    contenu = (
      <>
        <CloudOff className="size-3.5 text-destructive" aria-hidden />
        {t('notes.saving.failed')}
      </>
    );
  else if (statut === 'saved')
    contenu = (
      <>
        <Check className="size-3.5 text-success" aria-hidden />
        {t('common.states.saved')}
      </>
    );
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {contenu}
    </span>
  );
}
