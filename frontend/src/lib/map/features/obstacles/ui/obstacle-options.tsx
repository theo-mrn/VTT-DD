'use client';

/**
 * Barre contextuelle de l'outil obstacles (W) : sous-mode (touches 1 à 7), largeur des portes,
 * « Poser aussi les murs » d'une pièce, rappel des gestes, et « Tout effacer » (confirmé,
 * annulable).
 */
import {
  AppWindow,
  ArrowRightToLine,
  BrickWall,
  DoorOpen,
  Minus,
  Plus,
  Scan,
  Spline,
  Square,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { executePlan } from '../engine/commands';
import { newPlan } from '../engine/kinds';
import { OBSTACLES, ROOMS } from '../engine/model';
import { obstacleContextOf } from '../engine/register';
import { OBSTACLE_MODES, ObstacleTool, type ObstacleMode } from '../engine/tool';
import { useMapState } from '@/components/map/engine-context';
import { focusMap, OptionButton, OptionSeparator } from './controls';

const ICONS: Record<ObstacleMode, LucideIcon> = {
  wall: BrickWall,
  rect: Square,
  door: DoorOpen,
  window: AppWindow,
  oneway: ArrowRightToLine,
  room: Scan,
  edit: Spline,
};

export function ObstacleOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = engine.tools.active;
  if (!(tool instanceof ObstacleTool)) return null;
  return <Options engine={engine} tool={tool} />;
}

function Options({ engine, tool }: Readonly<{ engine: MapEngine; tool: ObstacleTool }>) {
  const mode = useStore(tool.settings, (s) => s.mode);
  const doorWidth = useStore(tool.settings, (s) => s.doorWidth);
  const roomWalls = useStore(tool.settings, (s) => s.roomWalls);
  const info = OBSTACLE_MODES.find((m) => m.id === mode)!;

  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        <div role="group" aria-label="Sous-mode" className="flex items-center gap-0.5">
          {OBSTACLE_MODES.map((m) => {
            const Icon = ICONS[m.id];
            return (
              <OptionButton
                key={m.id}
                label={m.label}
                shortcut={m.key}
                active={mode === m.id}
                onClick={() => {
                  tool.setMode(m.id);
                  focusMap(engine);
                }}
              >
                <Icon />
              </OptionButton>
            );
          })}
        </div>

        {mode === 'door' && (
          <>
            <OptionSeparator />
            <div className="flex items-center gap-1" role="group" aria-label="Largeur des portes">
              <span className="px-1 text-xs text-muted-foreground">Largeur</span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Porte plus étroite"
                disabled={doorWidth <= 0.5}
                onClick={() =>
                  tool.settings.setState({ doorWidth: Math.max(0.5, doorWidth - 0.5) })
                }
              >
                <Minus />
              </Button>
              <span className="min-w-14 text-center font-mono text-xs tabular-nums">
                {doorWidth.toLocaleString('fr-FR')} {doorWidth > 1 ? 'cases' : 'case'}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Porte plus large"
                disabled={doorWidth >= 6}
                onClick={() => tool.settings.setState({ doorWidth: Math.min(6, doorWidth + 0.5) })}
              >
                <Plus />
              </Button>
            </div>
          </>
        )}

        {mode === 'room' && (
          <>
            <OptionSeparator />
            <label className="flex cursor-pointer items-center gap-2 px-1 text-xs text-muted-foreground">
              <Switch
                checked={roomWalls}
                onCheckedChange={(on) => tool.settings.setState({ roomWalls: on })}
                aria-label="Poser aussi les murs"
              />
              Poser aussi les murs
            </label>
          </>
        )}

        <OptionSeparator />
        <ClearAll engine={engine} />
      </div>
      <p className="max-w-[36rem] px-2 text-center text-[11px] leading-snug text-muted-foreground">
        {info.hint}
      </p>
    </div>
  );
}

/** « Tout effacer » : murs, portes, fenêtres et pièces de la scène (confirmé, annulable). */
function ClearAll({ engine }: Readonly<{ engine: MapEngine }>) {
  const obstacles = useMapState((s) => s.collections[OBSTACLES]?.size ?? 0);
  const rooms = useMapState((s) => s.collections[ROOMS]?.size ?? 0);
  const total = obstacles + rooms;
  const clear = async () => {
    const ctx = obstacleContextOf(engine);
    if (!ctx) return;
    const ok = await engine.confirm({
      title: 'Tout effacer ?',
      message: `Supprimer les ${obstacles} obstacles et ${rooms} pièces de cette scène ? L’action s’annule par ⌘/Ctrl+Z.`,
      confirmLabel: 'Tout effacer',
      danger: true,
    });
    if (!ok) return;
    const plan = newPlan(engine);
    for (const o of [...plan.obstacles()]) plan.removeObstacle(o.id);
    for (const r of [...plan.rooms()]) plan.removeRoom(r.id);
    void executePlan(engine, 'Tout effacer', plan, ctx.persistences);
  };
  return (
    <Info texte="Tout effacer (obstacles et pièces)">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Tout effacer"
        disabled={!total}
        onClick={() => void clear()}
        className="hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </Info>
  );
}
