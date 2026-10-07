'use client';

/**
 * « Quadrillage » (barre d'outils) : l'interrupteur d'affichage sur son écran (tous, Q) et, pour
 * le MJ, les réglages des quadrillages de la scène (docs/carte.md § 4).
 * Chacun a sa case, son origine, sa couleur, son opacité, son épaisseur, et se montre ou non
 * aux joueurs ; la grille de jeu donne la case de la scène (tokens, rayons, aimantation).
 * « Ajuster sur l'image » : glisser sur des cases dessinées dans le fond pour caler case et
 * origine. Chaque changement est une commande annulable (`PATCH /maps/:mapId`).
 */
import { formatter, translate } from '@/i18n/runtime';
import { mapActionShortcutOf } from '@/lib/map/shortcuts';
import { useBindingLabel } from '@/lib/shortcuts/hooks';
import { MAP_GRIDS_MAX, type MapGrid } from '@vtt/contracts';
import { Check, ChevronUp, Grid3x3, Plus, Ruler, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EditableValue } from '@/components/ui/editable-value';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { calibrateSettings, gridDisplay, saveGrids, setGridShown } from '../engine/state';
import {
  CALIBRATE_CELLS,
  GRID_CALIBRATE_TOOL_ID,
  GRID_COLORS,
  newGrid,
  withGrid,
} from '../engine/model';
import { cn } from '@/lib/utils';
import { useMapState } from '@/components/map/engine-context';

const NO_GRIDS: readonly MapGrid[] = [];

/**
 * Dans la barre : l'interrupteur (tous, sur son écran, Q) et, pour le MJ, les réglages à côté.
 * Un joueur sans quadrillage montré n'a rien ; un MJ sans quadrillage n'a que les réglages.
 */
export function GridControls({ engine }: Readonly<{ engine: MapEngine }>) {
  const gm = engine.viewer.role === 'gm';
  const grids = useMapState((s) => (s.scene?.grids as MapGrid[] | undefined) ?? NO_GRIDS);
  const mine = gm ? grids : grids.filter((g) => g.visibleToPlayers);
  const shown = useStore(gridDisplay, (s) => s.shown);
  const touche = useBindingLabel(mapActionShortcutOf('grid.toggle'));
  if (!gm && !mine.length) return null;
  return (
    <div className="flex items-center">
      {mine.length > 0 && (
        <Info
          texte={
            <span className="flex items-center gap-2">
              {shown ? translate('map.grid.hide') : translate('map.grid.show')}
              {touche.label && <Kbd>{touche.label}</Kbd>}
            </span>
          }
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={shown ? translate('map.grid.hide') : translate('map.grid.show')}
            aria-pressed={shown}
            aria-keyshortcuts={touche.aria}
            onClick={() => setGridShown(!shown)}
            className={cn(shown && 'bg-primary/10 text-primary')}
          >
            <Grid3x3 />
          </Button>
        </Info>
      )}
      {gm && <GridSettings engine={engine} grids={grids} compact={mine.length > 0} />}
    </div>
  );
}

/** Réglages des quadrillages de la scène (MJ). */
function GridSettings({
  engine,
  grids,
  compact,
}: Readonly<{
  engine: MapEngine;
  grids: readonly MapGrid[];
  /** À côté de l'interrupteur : un chevron ; seul (aucun quadrillage) : l'icône du quadrillage. */
  compact: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const save = (label: string, next: MapGrid[]) => void saveGrids(engine, label, next);
  const add = () => {
    const grid = newGrid(grids, engine.kindContext().pixelsPerUnit);
    if (grid) {
      save(translate('map.grid.add'), [...grids, grid]);
      setGridShown(true);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte={translate('map.grid.settings')}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={translate('map.grid.settings')}
            className={cn(compact && 'w-5 px-0 text-muted-foreground')}
          >
            {compact ? <ChevronUp /> : <Grid3x3 />}
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent
        side="top"
        className="max-h-[70vh] w-80 overflow-y-auto p-3"
        // Rien de sélectionné à l'ouverture : une touche ne renomme pas le quadrillage
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="text-sm font-semibold">{translate('map.grid.title')}</p>
        <p className="mb-3 text-xs text-muted-foreground">{translate('map.grid.lead')}</p>
        <div className="space-y-3">
          {grids.map((grid) => (
            <GridCard
              key={grid.id}
              engine={engine}
              grid={grid}
              onChange={(label, patch) => save(label, withGrid(grids, grid.id, patch))}
              onRemove={() =>
                save(
                  translate('map.grid.remove'),
                  grids.filter((g) => g.id !== grid.id),
                )
              }
              onCalibrate={() => setOpen(false)}
            />
          ))}
          {grids.length === 0 && (
            <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 text-center text-xs text-muted-foreground">
              {translate('map.grid.none')}
            </p>
          )}
          {grids.length < MAP_GRIDS_MAX && (
            <Button variant="secondary" size="sm" className="w-full" onClick={add}>
              <Plus />
              {grids.length ? translate('map.grid.add') : translate('map.grid.addPlay')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GridCard({
  engine,
  grid,
  onChange,
  onRemove,
  onCalibrate,
}: Readonly<{
  engine: MapEngine;
  grid: MapGrid;
  onChange: (label: string, patch: Partial<Omit<MapGrid, 'id'>>) => void;
  onRemove: () => void;
  onCalibrate: () => void;
}>) {
  const settings = calibrateSettings(engine);
  const cells = useStore(settings, (s) => s.cells);
  const unit = engine.kindContext().unitName;

  const calibrate = () => {
    settings.setState({ gridId: grid.id });
    engine.tools.activate(GRID_CALIBRATE_TOOL_ID);
    onCalibrate();
    toast(
      cells === 1
        ? translate('map.grid.dragOne')
        : translate('map.grid.dragMany', { cells: String(cells) }),
      { description: translate('map.grid.escapeToCancel') },
    );
  };

  return (
    <div
      className={cn(
        'space-y-2.5 rounded-xl border p-2.5',
        grid.primary ? 'border-primary/40 bg-primary/[0.04]' : 'border-border',
      )}
    >
      <div className="flex items-center gap-1.5">
        <TextField
          label={translate('map.grid.name')}
          value={grid.name}
          onCommit={(name) => onChange(translate('map.grid.rename'), { name })}
        />
        <Info texte={translate('map.grid.removeThis')}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={translate('map.grid.removeOf', {
              name: grid.name || translate('map.grid.thisGrid'),
            })}
            onClick={onRemove}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </Info>
      </div>

      <Row
        label={translate('map.grid.playGrid')}
        hint={grid.primary ? translate('map.grid.cellUnit', { unit }) : undefined}
      >
        <Switch
          checked={grid.primary}
          aria-label={translate('map.grid.playGrid')}
          onCheckedChange={(primary) => onChange(translate('map.grid.playGrid'), { primary })}
        />
      </Row>
      <Row label={translate('map.grid.visible')}>
        <Switch
          checked={grid.visibleToPlayers}
          aria-label={translate('map.grid.visible')}
          onCheckedChange={(visibleToPlayers) =>
            onChange(translate('map.grid.shownToPlayers'), { visibleToPlayers })
          }
        />
      </Row>

      <div className="grid grid-cols-3 gap-1.5">
        <NumberField
          label={translate('map.grid.cellPx')}
          value={grid.size}
          min={4}
          max={10_000}
          onCommit={(size) => onChange(translate('map.grid.cellSize'), { size })}
        />
        <NumberField
          label={translate('map.grid.originX')}
          value={grid.offsetX}
          min={-100_000}
          max={100_000}
          onCommit={(offsetX) => onChange(translate('map.grid.origin'), { offsetX })}
        />
        <NumberField
          label={translate('map.grid.originY')}
          value={grid.offsetY}
          min={-100_000}
          max={100_000}
          onCommit={(offsetY) => onChange(translate('map.grid.origin'), { offsetY })}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground">{translate('map.grid.fitOnImage')}</p>
        <div className="flex items-center gap-1">
          <div
            role="radiogroup"
            aria-label={translate('map.grid.cellsCovered')}
            className="flex gap-0.5"
          >
            {CALIBRATE_CELLS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={cells === n}
                aria-label={`${n} × ${n} cases`}
                onClick={() => settings.setState({ cells: n })}
                className={cn(
                  'h-7 min-w-7 rounded-md px-1.5 text-xs tabular-nums text-muted-foreground transition-colors',
                  'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  cells === n && 'bg-primary/15 text-primary',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <Button size="xs" variant="secondary" className="ml-auto" onClick={calibrate}>
            <Ruler />
            {translate('map.grid.fit')}
          </Button>
        </div>
      </div>

      <div
        className="flex items-center gap-1"
        role="radiogroup"
        aria-label={translate('map.grid.color')}
      >
        {GRID_COLORS.map((c) => (
          <Info key={c.value} texte={translate(`map.grid.colors.${c.name}`)}>
            <button
              type="button"
              role="radio"
              aria-checked={grid.color === c.value}
              aria-label={translate(`map.grid.colors.${c.name}`)}
              onClick={() => onChange(translate('map.grid.gridColor'), { color: c.value })}
              className={cn(
                'grid size-6 place-items-center rounded-full border border-border-strong',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                grid.color === c.value &&
                  'ring-2 ring-primary ring-offset-1 ring-offset-background',
              )}
              // Couleur du quadrillage : une donnée de la scène
              style={{ backgroundColor: c.value }}
            >
              {grid.color === c.value && (
                <Check className="size-3 text-foreground mix-blend-difference" aria-hidden />
              )}
            </button>
          </Info>
        ))}
      </div>

      <SliderRow
        label={translate('map.grid.opacity')}
        value={Math.round(grid.opacity * 100)}
        min={5}
        max={100}
        step={5}
        format={(v) => formatter().number(v / 100, 'percent')}
        onCommit={(v) => onChange(translate('map.grid.gridOpacity'), { opacity: v / 100 })}
      />
      <SliderRow
        label={translate('map.grid.thickness')}
        value={grid.thickness}
        min={0.5}
        max={4}
        step={0.5}
        format={(v) => `${v} px`}
        onCommit={(thickness) => onChange(translate('map.grid.gridThickness'), { thickness })}
      />
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: Readonly<{ label: string; hint?: string; children: ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px]">
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

/** Champ texte validé au départ du champ ou sur Entrée (pas une écriture par touche). */
function TextField({
  label,
  value,
  onCommit,
}: Readonly<{
  label: string;
  value: string;
  onCommit: (v: string) => void;
}>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const v = draft.trim().slice(0, 60);
    if (v !== value) onCommit(v);
  };
  return (
    <Input
      aria-label={label}
      value={draft}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(value);
      }}
      className="h-7 flex-1 text-[13px]"
    />
  );
}

/** Nombre validé au départ du champ ou sur Entrée, borné. */
function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}>) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Number(draft.replace(',', '.'));
    if (!Number.isFinite(v)) return setDraft(String(value));
    const bounded = Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
    if (bounded !== value) onCommit(bounded);
    else setDraft(String(value));
  };
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-muted-foreground">{label}</span>
      <Input
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setDraft(String(value));
        }}
        className="h-7 text-[13px] tabular-nums"
      />
    </label>
  );
}

/** Curseur : aperçu local pendant le geste, une seule écriture au lâcher. */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <EditableValue
          label={label}
          value={draft}
          format={format}
          min={min}
          max={max}
          onCommit={(v) => {
            setDraft(v);
            onCommit(v);
          }}
          className="tabular-nums"
        />
      </div>
      <Slider
        aria-label={label}
        value={[draft]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => setDraft(v!)}
        onValueCommit={([v]) => v !== value && onCommit(v!)}
      />
    </div>
  );
}
