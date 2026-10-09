'use client';

/**
 * « Échelle et quadrillage » (MJ, docs/carte.md § 4) : un panneau latéral, ouvert à côté de la
 * carte (il reste ouvert pendant qu'on calibre), qui règle tout ce qui touche à l'échelle :
 *
 * - Case : sa taille en pixels du fond, détectée dans l'image, calibrée en glissant sur des
 *   cases dessinées, ou automatique (sans quadrillage) ;
 * - Distance : « 1 case = 1,5 m » de la campagne, ou propre à cette scène ; décompte des
 *   diagonales, règle de la table ;
 * - Quadrillage : montré aux joueurs, couleur, opacité, épaisseur, décalage ;
 * - Tokens : leur taille, pour toute la campagne.
 */
import { formatter, translate } from '@/i18n/runtime';
import {
  playGridOf,
  sceneScale,
  type MapDiagonals,
  type MapGrid,
  type MapScale,
} from '@vtt/contracts';
import { Check, Crosshair, Grid3x3, Ruler, ScanSearch, Undo2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { EditableValue } from '@/components/ui/editable-value';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import { MapPanel } from '@/components/map/map-panel';
import { useMapEngine, useMapState } from '@/components/map/engine-context';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { diagonalsOf } from '@/lib/map/store/map-store';
import { RangeField } from '@/lib/map/features/obstacles/ui/controls';
import { cn } from '@/lib/utils';
import { CALIBRATE_CELLS, GRID_COLORS } from '../engine/model';
import {
  automaticCell,
  patchCampaignSettings,
  patchGrid,
  scalePanelOf,
  setCellSize,
  setSceneScale,
  toggleScalePanel,
} from '../engine/panel';
import { calibrateSettings } from '../engine/state';
import { calibrateScene, detectSceneGrid } from './scale-assistant';

const NO_GRIDS: MapGrid[] = [];
const CELL_MIN = 10;
const CELL_MAX = 400;
const DIAGONALS: readonly MapDiagonals[] = ['chebyshev', 'alternating', 'manhattan', 'off'];

export function ScalePanel() {
  const engine = useMapEngine();
  const open = useStore(scalePanelOf(engine), (s) => s.open);
  if (!open || engine.viewer.role !== 'gm') return null;
  return (
    <MapPanel
      id="scale"
      label={translate('map.grid.panel')}
      icon={Ruler}
      title={translate('map.grid.panel')}
      closeLabel={translate('map.grid.closePanel')}
      onClose={() => toggleScalePanel(engine, false)}
      className="w-80"
    >
      <div
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <CellSection engine={engine} />
        <DistanceSection engine={engine} />
        <GridSection engine={engine} />
        <TokensSection engine={engine} />
      </div>
    </MapPanel>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section aria-label={title} className="space-y-2.5">
      <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-subtle">{title}</h3>
      {children}
    </section>
  );
}

// ─── Case ─────────────────────────────────────────────────────────────────────

function CellSection({ engine }: Readonly<{ engine: MapEngine }>) {
  const grids = useMapState((s) => (s.scene?.grids as MapGrid[] | undefined) ?? NO_GRIDS);
  const hasBackground = useMapState((s) => Boolean(s.scene?.backgroundUrl));
  // Case de la scène : le quadrillage, sinon le repli (suivie à chaque changement de scène)
  const cell = useMapState(() => engine.kindContext().pixelsPerUnit);
  const play = playGridOf({ grids });
  const settings = calibrateSettings(engine);
  const cells = useStore(settings, (s) => s.cells);
  const [detecting, setDetecting] = useState(false);

  return (
    <Section title={translate('map.grid.cell')}>
      <div className="flex items-center gap-2">
        <Info texte={play ? translate('map.grid.playGridOfScene') : translate('map.grid.autoHint')}>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              play ? 'bg-primary/15 text-primary-strong' : 'bg-surface-3 text-muted-foreground',
            )}
          >
            {play ? translate('map.grid.grid') : translate('map.grid.auto')}
          </span>
        </Info>
      </div>
      <RangeField
        label={translate('map.grid.cellSize')}
        value={Math.round(cell * 100) / 100}
        min={CELL_MIN}
        max={CELL_MAX}
        inputMax={CELL_MAX * 10}
        step={1}
        format={(v) => `${formatter().number(Math.round(v))} px`} // i18n-ignore
        onCommit={(v) => void setCellSize(engine, v)}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Info texte={translate('map.grid.detectHint')}>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasBackground}
            loading={detecting}
            onClick={async () => {
              setDetecting(true);
              const found = await detectSceneGrid(engine).catch(() => false);
              setDetecting(false);
              if (!found) toast(translate('map.grid.noGridFound'));
            }}
          >
            <ScanSearch /> {translate('map.grid.detect')}
          </Button>
        </Info>
        {play && (
          <Info texte={translate('map.grid.autoHint')}>
            <Button variant="ghost" size="sm" onClick={() => void automaticCell(engine)}>
              <Undo2 /> {translate('map.grid.auto')}
            </Button>
          </Info>
        )}
      </div>
      <div className="space-y-1.5">
        <span className="text-[13px]">{translate('map.grid.fitOnImage')}</span>
        <div className="flex items-center gap-1">
          <div
            role="radiogroup"
            aria-label={translate('map.grid.cellsCovered')}
            className="flex gap-0.5"
          >
            {CALIBRATE_CELLS.map((n) => (
              <Info key={n} texte={translate('map.grid.cellsCoveredN', { n })}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={cells === n}
                  aria-label={translate('map.grid.cellsCoveredN', { n })}
                  onClick={() => settings.setState({ cells: n })}
                  className={cn(
                    'h-7 min-w-7 rounded-md px-1.5 text-xs tabular-nums text-muted-foreground transition-colors',
                    'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    cells === n && 'bg-primary/15 text-primary',
                  )}
                >
                  {n}
                </button>
              </Info>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={() => calibrateScene(engine, cells)}
          >
            <Crosshair /> {translate('map.grid.calibrate')}
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ─── Distance ─────────────────────────────────────────────────────────────────

function DistanceSection({ engine }: Readonly<{ engine: MapEngine }>) {
  const own = useMapState((s) => (s.scene as { scale?: MapScale | null } | null)?.scale ?? null);
  const campaignPer = useMapState(
    (s) =>
      sceneScale(null, s.settings as { unitsPerCell?: number; unitName?: string }).unitsPerCell,
  );
  const campaignUnit = useMapState(
    (s) => sceneScale(null, s.settings as { unitsPerCell?: number; unitName?: string }).unitName,
  );
  const diagonals = useMapState((s) => diagonalsOf(s.settings));
  const value: MapScale = own ?? { unitsPerCell: campaignPer, unitName: campaignUnit };
  const save = (next: MapScale) => {
    if (own) void setSceneScale(engine, next);
    else patchCampaignSettings(engine, next);
  };

  return (
    <Section title={translate('map.grid.distance')}>
      <div className="flex items-center gap-2 text-[13px]">
        <span>{translate('map.grid.oneCell')}</span>
        <EditableValue
          label={translate('map.grid.unitsPerCell')}
          value={value.unitsPerCell}
          format={(v) => formatter().number(v)}
          min={0.01}
          max={100_000}
          onCommit={(v) => v > 0 && save({ ...value, unitsPerCell: v })}
          className="rounded-md bg-surface-2 px-2 py-1 font-mono tabular-nums"
        />
        <UnitInput value={value.unitName} onCommit={(unitName) => save({ ...value, unitName })} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Info texte={translate('map.grid.sceneOnlyHint')}>
          <label htmlFor="scale-scene-only" className="text-[13px]">
            {translate('map.grid.sceneOnly')}
          </label>
        </Info>
        <Switch
          id="scale-scene-only"
          checked={!!own}
          onCheckedChange={(on) => void setSceneScale(engine, on ? value : null)}
        />
      </div>
      <div className="space-y-1">
        <span className="text-[13px]">{translate('map.grid.diagonals')}</span>
        <div role="radiogroup" aria-label={translate('map.grid.diagonals')} className="space-y-0.5">
          {DIAGONALS.map((d) => (
            <Info key={d} texte={translate(`map.measurements.counting.${d}.hint`)} cote="left">
              <button
                type="button"
                role="radio"
                aria-checked={d === diagonals}
                onClick={() => d !== diagonals && patchCampaignSettings(engine, { diagonals: d })}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  d === diagonals && 'text-primary',
                )}
              >
                {translate(`map.measurements.counting.${d}.label`)}
                {d === diagonals && <Check className="size-3.5" aria-hidden />}
              </button>
            </Info>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** Nom de l'unité (« m », « ft », « km »…), enregistré à la sortie du champ ou par Entrée. */
function UnitInput({ value, onCommit }: Readonly<{ value: string; onCommit(v: string): void }>) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const next = text.trim().slice(0, 20);
    if (next && next !== value) onCommit(next);
    else setText(value);
  };
  return (
    <Input
      aria-label={translate('map.grid.unitName')}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className="h-7 w-16"
    />
  );
}

// ─── Quadrillage ──────────────────────────────────────────────────────────────

function GridSection({ engine }: Readonly<{ engine: MapEngine }>) {
  const grids = useMapState((s) => (s.scene?.grids as MapGrid[] | undefined) ?? NO_GRIDS);
  const grid = playGridOf({ grids });
  if (!grid)
    return (
      <Section title={translate('map.grid.title')}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void setCellSize(engine, engine.kindContext().pixelsPerUnit)}
        >
          <Grid3x3 /> {translate('map.grid.addPlay')}
        </Button>
      </Section>
    );
  const set = (label: string, patch: Partial<Omit<MapGrid, 'id'>>) =>
    void patchGrid(engine, label, patch);
  return (
    <Section title={translate('map.grid.title')}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="grid-visible" className="text-[13px]">
          {translate('map.grid.visible')}
        </label>
        <Switch
          id="grid-visible"
          checked={grid.visibleToPlayers}
          onCheckedChange={(on) =>
            set(translate('map.grid.shownToPlayers'), { visibleToPlayers: on })
          }
        />
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
              onClick={() => set(translate('map.grid.gridColor'), { color: c.value })}
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
      <RangeField
        label={translate('map.grid.opacity')}
        value={grid.opacity}
        min={0.05}
        max={1}
        step={0.05}
        scale={100}
        format={(v) => formatter().number(v, 'percent')}
        onCommit={(opacity) => set(translate('map.grid.gridOpacity'), { opacity })}
      />
      <RangeField
        label={translate('map.grid.thickness')}
        value={grid.thickness}
        min={0.5}
        max={8}
        step={0.5}
        format={(v) => `${formatter().number(v)} px`} // i18n-ignore
        onCommit={(thickness) => set(translate('map.grid.gridThickness'), { thickness })}
      />
      <div className="grid grid-cols-2 gap-3">
        <RangeField
          label={translate('map.grid.originX')}
          value={grid.offsetX}
          min={0}
          max={grid.size}
          step={1}
          format={(v) => `${formatter().number(Math.round(v))} px`} // i18n-ignore
          onCommit={(offsetX) => set(translate('map.grid.origin'), { offsetX })}
        />
        <RangeField
          label={translate('map.grid.originY')}
          value={grid.offsetY}
          min={0}
          max={grid.size}
          step={1}
          format={(v) => `${formatter().number(Math.round(v))} px`} // i18n-ignore
          onCommit={(offsetY) => set(translate('map.grid.origin'), { offsetY })}
        />
      </div>
    </Section>
  );
}

// ─── Tokens ───────────────────────────────────────────────────────────────────

function TokensSection({ engine }: Readonly<{ engine: MapEngine }>) {
  const tokenScale = useMapState((s) => {
    const v = (s.settings as { tokenScale?: number } | null)?.tokenScale;
    return typeof v === 'number' && v > 0 ? v : 1;
  });
  return (
    <Section title={translate('map.grid.tokens')}>
      <Info texte={translate('map.grid.allScenes')} cote="left">
        <div>
          <RangeField
            label={translate('map.grid.tokenSize')}
            value={tokenScale}
            min={0.5}
            max={2}
            inputMax={4}
            step={0.05}
            scale={100}
            format={(v) => formatter().number(v, 'percent')}
            onCommit={(v) => v !== tokenScale && patchCampaignSettings(engine, { tokenScale: v })}
          />
        </div>
      </Info>
    </Section>
  );
}
