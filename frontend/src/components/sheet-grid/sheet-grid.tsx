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
} from './model';
import { heightModeOf, isBlockEmpty, minSizeOf, sizeFor } from './sizing';
import './sheet-grid.css';

/** Délai avant d'enregistrer une série de changements (déplacements successifs). */
const DELAI_ENREGISTREMENT = 700;

type Statut = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Compactage vertical : chaque bloc remonte au plus haut sans chevaucher ceux placés avant. */
function compact(items: SheetLayoutItem[]): SheetLayoutItem[] {
  const places: SheetLayoutItem[] = [];
  const chevauche = (a: SheetLayoutItem, b: SheetLayoutItem) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const it of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const courant = { ...it, y: 0 };
    while (places.some((p) => chevauche(courant, p))) courant.y++;
    places.push(courant);
  }
  const ordre = new Map(items.map((it, i) => [it.i, i]));
  return places.sort((a, b) => ordre.get(a.i)! - ordre.get(b.i)!);
}

const recouvreX = (a: SheetLayoutItem, b: SheetLayoutItem) => a.x < b.x + b.w && b.x < a.x + a.w;

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
  let suivant = { ...it };
  let reste = autres;
  if (agrandir) {
    if (hauteurAuto && (touche === 'ArrowDown' || touche === 'ArrowUp')) return null;
    if (touche === 'ArrowRight') suivant.w = Math.min(cols - it.x, it.w + 1);
    if (touche === 'ArrowLeft') suivant.w = Math.max(min.w, it.w - 1);
    if (touche === 'ArrowDown') suivant.h = Math.min(200, it.h + 1);
    if (touche === 'ArrowUp') suivant.h = Math.max(min.h, it.h - 1);
  } else if (touche === 'ArrowRight' || touche === 'ArrowLeft') {
    suivant.x = Math.max(0, Math.min(cols - it.w, it.x + (touche === 'ArrowRight' ? 1 : -1)));
  } else if (touche === 'ArrowDown') {
    // Passe sous le premier bloc qui le suit dans ses colonnes
    const dessous = autres
      .filter((o) => recouvreX(o, it) && o.y >= it.y + it.h)
      .sort((a, b) => a.y - b.y)[0];
    if (!dessous) return null;
    suivant = { ...it, y: dessous.y + dessous.h };
    reste = autres.map((o) => (o.i === dessous.i ? { ...o, y: it.y } : o));
  } else if (touche === 'ArrowUp') {
    // Passe au-dessus du bloc qui le précède dans ses colonnes
    const dessus = autres
      .filter((o) => recouvreX(o, it) && o.y + o.h <= it.y)
      .sort((a, b) => b.y - a.y)[0];
    if (!dessus) return null;
    suivant = { ...it, y: dessus.y };
    reste = autres.map((o) => (o.i === dessus.i ? { ...o, y: dessus.y + it.h } : o));
  } else return null;
  return compact([...reste, suivant]);
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
}: {
  ctx: ContexteFiche;
  /** Mise en page enregistrée ; null : disposition par défaut de la présentation. */
  layout: SheetLayout | null;
  /** Personnalisation en cours (seulement si l'utilisateur en a le droit). */
  editing: boolean;
  onEditingChange: (v: boolean) => void;
  /** Enregistre la mise en page (null : retour à la disposition par défaut). */
  onSave: (layout: SheetLayout | null) => Promise<unknown>;
}) {
  // ─── Largeur du conteneur ────────────────────────────────────────────────
  const conteneur = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = conteneur.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargeur(Math.floor(e!.contentRect.width)));
    obs.observe(el);
    setLargeur(Math.floor(el.getBoundingClientRect().width));
    return () => obs.disconnect();
  }, []);
  const bp = breakpointFor(largeur);

  // ─── Mise en page : enregistrée, ou brouillon pendant la personnalisation ──
  const sizeOf = useMemo(() => sizeFor(ctx), [ctx]);
  const serveur = useMemo(
    () =>
      stateFrom(
        layout,
        () => defaultWidgets(ctx).map((w, i) => gridBlock(`p${i + 1}`, w)),
        sizeOf,
        minSizeOf,
        // Bloc enregistré qui vise un attribut ou une sorte retirés des règles : indisponible
        (w) => erreursWidget(ctx.systeme, ctx.fiche.etat.type, w).length === 0,
      ),
    [layout, ctx, sizeOf],
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
      toast.error(`Mise en page non enregistrée : ${messageErreur(e)}`);
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
  const vides = useMemo(
    () =>
      new Set(etat.blocks.filter((b) => b.widget && isBlockEmpty(ctx, b.widget)).map((b) => b.id)),
    [etat.blocks, ctx],
  );
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
      setAnnonce('Bloc retiré de la fiche.');
    },
    [brouillon, changer],
  );

  const ajouter = useCallback(
    (w: Widget) => {
      if (!brouillon) return;
      if (brouillon.blocks.length >= MAX_BLOCKS) {
        toast.error(`${MAX_BLOCKS} blocs au plus sur une fiche.`);
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
      setAnnonce(`Bloc « ${w.titre} » ajouté en bas de la fiche.`);
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
    setAnnonce('Disposition par défaut rétablie.');
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
      if (!e.key.startsWith('Arrow')) return;
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
          ? `Taille : ${it.w} colonne(s) sur ${it.h} rangée(s).`
          : `Position : colonne ${it.x + 1}, rangée ${it.y + 1}.`,
      );
    },
    [brouillon, bp, retirer, appliquerPositions, modes, layouts],
  );

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
          aria-label="Personnalisation de la fiche"
          className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-popover/95 px-3 py-2 shadow-elevated backdrop-blur"
        >
          <LayoutGrid className="size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Personnalisation</p>
            <p className="hidden text-xs text-muted-foreground md:block">
              Glissez un bloc pour le déplacer, tirez son bord pour changer sa largeur. Au clavier :{' '}
              <Kbd>←↑→↓</Kbd> déplace, <Kbd>Maj</Kbd>+<Kbd>←↑→↓</Kbd> redimensionne,{' '}
              <Kbd>Suppr</Kbd> retire.
            </p>
          </div>
          <StatutEnregistrement statut={statut} />
          <Button variant="secondary" size="sm" onClick={() => setSelecteur(true)}>
            <Plus />
            Ajouter un bloc
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmation(true)}>
            <RotateCcw />
            Réinitialiser
          </Button>
          <Button size="sm" onClick={terminer}>
            <Check />
            Terminer
          </Button>
        </div>
      )}

      <div ref={conteneur} className="min-w-0">
        {largeur === 0 ? (
          <div
            className="grid gap-4 md:grid-cols-2"
            aria-busy
            aria-label="Mise en page de la fiche"
          >
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : visibles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-muted-foreground">
            {editing
              ? 'Aucun bloc sur cette fiche. Ajoutez-en un pour commencer.'
              : 'Rien à afficher sur cette fiche pour l’instant.'}
          </div>
        ) : (
          <Responsive
            className={cn('sheet-grid', editing && 'sheet-grid-editing')}
            width={largeur}
            breakpoints={BREAKPOINTS}
            cols={COLUMNS}
            layouts={layouts}
            rowHeight={ROW_HEIGHT}
            margin={[MARGIN, MARGIN]}
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
                  aria-roledescription={editing ? 'bloc déplaçable' : undefined}
                  aria-label={
                    editing
                      ? `${titre} : flèches pour déplacer, Maj et flèches pour redimensionner, Suppr pour retirer`
                      : undefined
                  }
                  onKeyDown={editing ? (e) => surTouche(b.id, e) : undefined}
                  className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <BlockFrame
                    block={b}
                    ctx={ctx}
                    editing={editing}
                    empty={vides.has(b.id)}
                    heightMode={modes.get(b.id) ?? 'auto'}
                    onMeasure={(px) => mesurer(b.id, px)}
                    onRemove={() => retirer(b.id)}
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
            <DialogTitle>Revenir à la disposition par défaut ?</DialogTitle>
            <DialogDescription>
              Les blocs ajoutés, retirés ou déplacés sur cette fiche sont oubliés, pour toute la
              table. La disposition par défaut vient des règles du personnage.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmation(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={reinitialiser}>
              <RotateCcw />
              Réinitialiser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatutEnregistrement({ statut }: { statut: Statut }) {
  if (statut === 'idle') return null;
  const contenu =
    statut === 'error' ? (
      <>
        <CloudOff className="size-3.5 text-destructive" aria-hidden />
        Non enregistré
      </>
    ) : statut === 'saved' ? (
      <>
        <Check className="size-3.5 text-success" aria-hidden />
        Enregistré
      </>
    ) : (
      <>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Enregistrement…
      </>
    );
  return (
    <span role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {contenu}
    </span>
  );
}
