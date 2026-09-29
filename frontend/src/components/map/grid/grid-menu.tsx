'use client';

/**
 * « Quadrillage » (MJ, barre d'outils) : les quadrillages de la scène (docs/carte.md § 4).
 * Chacun a sa case, son origine, sa couleur, son opacité, son épaisseur, et se montre ou non
 * aux joueurs ; la grille de jeu donne la case de la scène (tokens, rayons, aimantation).
 * « Ajuster sur l'image » : glisser sur des cases dessinées dans le fond pour caler case et
 * origine. Chaque changement est une commande annulable (`PATCH /maps/:mapId`).
 */
import { MAP_GRIDS_MAX, type MapGrid } from '@vtt/contracts';
import { Check, Grid3x3, Plus, Ruler, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { calibrateSettings, saveGrids } from '@/lib/map/modules/grid/state';
import {
  CALIBRATE_CELLS,
  GRID_CALIBRATE_TOOL_ID,
  GRID_COLORS,
  newGrid,
  withGrid,
} from '@/lib/map/modules/grid/model';
import { cn } from '@/lib/utils';
import { useMapState } from '../engine-context';

const NO_GRIDS: readonly MapGrid[] = [];

export function GridMenu({ engine }: { engine: MapEngine }) {
  const [open, setOpen] = useState(false);
  const grids = useMapState((s) => (s.scene?.grids as MapGrid[] | undefined) ?? NO_GRIDS);
  const shown = grids.some((g) => g.visibleToPlayers);

  const save = (label: string, next: MapGrid[]) => void saveGrids(engine, label, next);
  const add = () => {
    const grid = newGrid(grids, engine.kindContext().pixelsPerUnit);
    if (grid) save('Ajouter un quadrillage', [...grids, grid]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte="Quadrillage">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Quadrillage"
            className={cn(shown && 'text-primary')}
          >
            <Grid3x3 />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side="top" className="max-h-[70vh] w-80 overflow-y-auto p-3">
        <p className="text-sm font-semibold">Quadrillage</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Aligné sur l’image : le même pour tous, à tous les zooms. La grille de jeu donne la case
          de la scène (taille des jetons, rayons, aimantation).
        </p>
        <div className="space-y-3">
          {grids.map((grid) => (
            <GridCard
              key={grid.id}
              engine={engine}
              grid={grid}
              onChange={(label, patch) => save(label, withGrid(grids, grid.id, patch))}
              onRemove={() =>
                save(
                  'Retirer un quadrillage',
                  grids.filter((g) => g.id !== grid.id),
                )
              }
              onCalibrate={() => setOpen(false)}
            />
          ))}
          {grids.length === 0 && (
            <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 text-center text-xs text-muted-foreground">
              Pas encore de quadrillage sur cette scène.
            </p>
          )}
          {grids.length < MAP_GRIDS_MAX && (
            <Button variant="secondary" size="sm" className="w-full" onClick={add}>
              <Plus />
              {grids.length ? 'Ajouter un quadrillage' : 'Ajouter la grille de jeu'}
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
}: {
  engine: MapEngine;
  grid: MapGrid;
  onChange: (label: string, patch: Partial<Omit<MapGrid, 'id'>>) => void;
  onRemove: () => void;
  onCalibrate: () => void;
}) {
  const settings = calibrateSettings(engine);
  const cells = useStore(settings, (s) => s.cells);
  const unit = engine.kindContext().unitName;

  const calibrate = () => {
    settings.setState({ gridId: grid.id });
    engine.tools.activate(GRID_CALIBRATE_TOOL_ID);
    onCalibrate();
    toast(
      cells === 1
        ? 'Glissez d’un coin à l’autre d’une case de l’image'
        : `Glissez sur ${cells} × ${cells} cases de l’image`,
      { description: 'Échap pour annuler.' },
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
          label="Nom du quadrillage"
          value={grid.name}
          onCommit={(name) => onChange('Renommer le quadrillage', { name })}
        />
        <Info texte="Retirer ce quadrillage">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Retirer ${grid.name || 'ce quadrillage'}`}
            onClick={onRemove}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </Info>
      </div>

      <Row label="Grille de jeu" hint={grid.primary ? `1 case = 1 ${unit}` : undefined}>
        <Switch
          checked={grid.primary}
          aria-label="Grille de jeu"
          onCheckedChange={(primary) => onChange('Grille de jeu', { primary })}
        />
      </Row>
      <Row label="Visible des joueurs">
        <Switch
          checked={grid.visibleToPlayers}
          aria-label="Visible des joueurs"
          onCheckedChange={(visibleToPlayers) =>
            onChange('Quadrillage montré aux joueurs', { visibleToPlayers })
          }
        />
      </Row>

      <div className="grid grid-cols-3 gap-1.5">
        <NumberField
          label="Case (px)"
          value={grid.size}
          min={4}
          max={10_000}
          onCommit={(size) => onChange('Taille de la case', { size })}
        />
        <NumberField
          label="Origine X"
          value={grid.offsetX}
          min={-100_000}
          max={100_000}
          onCommit={(offsetX) => onChange('Origine du quadrillage', { offsetX })}
        />
        <NumberField
          label="Origine Y"
          value={grid.offsetY}
          min={-100_000}
          max={100_000}
          onCommit={(offsetY) => onChange('Origine du quadrillage', { offsetY })}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground">Ajuster sur l’image</p>
        <div className="flex items-center gap-1">
          <div role="radiogroup" aria-label="Cases couvertes" className="flex gap-0.5">
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
            Ajuster
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Couleur">
        {GRID_COLORS.map((c) => (
          <Info key={c.value} texte={c.label}>
            <button
              type="button"
              role="radio"
              aria-checked={grid.color === c.value}
              aria-label={c.label}
              onClick={() => onChange('Couleur du quadrillage', { color: c.value })}
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
        label="Opacité"
        value={Math.round(grid.opacity * 100)}
        min={5}
        max={100}
        step={5}
        format={(v) => `${v} %`}
        onCommit={(v) => onChange('Opacité du quadrillage', { opacity: v / 100 })}
      />
      <SliderRow
        label="Épaisseur"
        value={grid.thickness}
        min={0.5}
        max={4}
        step={0.5}
        format={(v) => `${v} px`}
        onCommit={(thickness) => onChange('Épaisseur du quadrillage', { thickness })}
      />
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{format(draft)}</span>
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
