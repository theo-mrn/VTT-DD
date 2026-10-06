'use client';

/**
 * Échelle de la scène (MJ, docs/carte.md § 4), toujours à portée : la case (grille de jeu,
 * créée cachée au besoin), la taille des tokens (toutes les scènes, `tokenScale`), et les
 * raccourcis détecter, calibrer, revenir à l'automatique (largeur du fond / 25).
 */
import { playGridOf, type MapGrid } from '@vtt/contracts';
import { Crosshair, Ruler, ScanSearch, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EditableValue } from '@/components/ui/editable-value';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { mapsApi } from '@/lib/map/api';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { newGrid, withGrid } from '../engine/model';
import { gridsOf, saveGrids } from '../engine/state';
import { cn } from '@/lib/utils';
import { useMapState } from '@/components/map/engine-context';
import { calibrateScene, detectSceneGrid } from './scale-assistant';

const NO_GRIDS: MapGrid[] = [];
const CELL_MIN = 10;
const CELL_MAX = 400;

/** Case de la scène fixée à `size` : la grille de jeu, créée cachée aux joueurs au besoin. */
function setCell(engine: MapEngine, size: number) {
  const grids = gridsOf(engine);
  const play = playGridOf({ grids });
  const rounded = Math.round(size * 100) / 100;
  if (play)
    return saveGrids(engine, 'Taille de la case', withGrid(grids, play.id, { size: rounded }));
  const created = newGrid(grids, rounded);
  if (!created) return null;
  return saveGrids(engine, 'Taille de la case', [
    ...grids,
    { ...created, visibleToPlayers: false },
  ]);
}

/** Retour à l'automatique : la grille de jeu cachée est retirée, une grille montrée n'est plus de jeu. */
function automatic(engine: MapEngine) {
  const grids = gridsOf(engine);
  const play = playGridOf({ grids });
  if (!play) return;
  const next = play.visibleToPlayers
    ? withGrid(grids, play.id, { primary: false })
    : grids.filter((g) => g.id !== play.id);
  void saveGrids(engine, 'Échelle automatique', next);
}

export function ScaleMenu({ engine }: Readonly<{ engine: MapEngine }>) {
  const grids = useMapState((s) => (s.scene?.grids as MapGrid[] | undefined) ?? NO_GRIDS);
  const hasBackground = useMapState((s) => Boolean(s.scene?.backgroundUrl));
  const campaignId = useMapState((s) => s.campaignId);
  const tokenScale = useMapState((s) => {
    const v = (s.settings as { tokenScale?: number } | null)?.tokenScale;
    return typeof v === 'number' && v > 0 ? v : 1;
  });
  const cell = engine.kindContext().pixelsPerUnit;
  const play = playGridOf({ grids });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(cell);
  const [scale, setScale] = useState(tokenScale);
  const [detecting, setDetecting] = useState(false);
  useEffect(() => setDraft(cell), [cell]);
  useEffect(() => setScale(tokenScale), [tokenScale]);

  const commitScale = (v: number) => {
    if (!campaignId || v === tokenScale) return;
    engine.store.getState().patchSettings({ tokenScale: v });
    mapsApi.updateSettings(campaignId, { tokenScale: v }).catch(() => {
      engine.store.getState().patchSettings({ tokenScale });
      toast.error('La taille des tokens n’a pas pu être enregistrée');
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte="Échelle de la scène">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Échelle de la scène"
            className={cn(open && 'bg-primary/10 text-primary')}
          >
            <Ruler />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side="top" className="w-80 space-y-4 p-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Case</span>
            <Info texte={play ? 'Grille de jeu de la scène' : 'Automatique : largeur du fond ÷ 25'}>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px]',
                  play ? 'bg-primary/15 text-primary-strong' : 'bg-surface-3 text-muted-foreground',
                )}
              >
                {play ? 'Grille' : 'Auto'}
              </span>
            </Info>
            <div className="ml-auto flex items-center gap-1">
              <Input
                type="number"
                inputMode="decimal"
                min={CELL_MIN}
                max={CELL_MAX * 10}
                step={1}
                value={Math.round(draft)}
                onChange={(e) => setDraft(Number(e.target.value) || draft)}
                onBlur={() => draft !== cell && void setCell(engine, draft)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && draft !== cell && void setCell(engine, draft)
                }
                aria-label="Taille de la case en pixels"
                className="h-7 w-20 text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground">px</span>
            </div>
          </div>
          <Slider
            value={[Math.min(CELL_MAX, draft)]}
            min={CELL_MIN}
            max={CELL_MAX}
            step={1}
            onValueChange={(v) => setDraft(v[0] ?? draft)}
            onValueCommit={(v) => void setCell(engine, v[0] ?? draft)}
            aria-label="Taille de la case"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center text-sm">
            <Info texte="Toutes les scènes de la campagne">
              <span className="font-semibold">Taille des tokens</span>
            </Info>
            <EditableValue
              label="Taille des tokens"
              value={scale}
              format={(v) => `${Math.round(v * 100)} %`}
              min={0.25}
              max={4}
              scale={100}
              onCommit={(v) => {
                setScale(v);
                commitScale(v);
              }}
              className="ml-auto text-xs tabular-nums text-muted-foreground"
            />
          </div>
          <Slider
            value={[scale]}
            min={0.5}
            max={2}
            step={0.05}
            onValueChange={(v) => setScale(v[0] ?? scale)}
            onValueCommit={(v) => commitScale(v[0] ?? scale)}
            aria-label="Taille des tokens"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasBackground}
            loading={detecting}
            onClick={async () => {
              setDetecting(true);
              const found = await detectSceneGrid(engine).catch(() => false);
              setDetecting(false);
              if (!found) toast('Aucun quadrillage trouvé dans l’image');
            }}
          >
            <ScanSearch /> Détecter
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(false);
              calibrateScene(engine);
            }}
          >
            <Crosshair /> Calibrer
          </Button>
          {play && (
            <Button variant="ghost" size="sm" onClick={() => automatic(engine)}>
              <Undo2 /> Auto
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
