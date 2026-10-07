'use client';

/**
 * Barre contextuelle de l'outil Exploration (MJ) : forme (touches 1 à 3), révéler ou oublier
 * (Alt inverse le temps du geste), exploration de la scène active ou coupée, réinitialiser.
 * Aucun texte d'aide : des infobulles.
 */
import {
  Circle,
  Eye,
  EyeOff,
  Lasso,
  RectangleHorizontal,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { cn } from '@/lib/utils';
import { focusMap, OptionButton, OptionSeparator } from '@/lib/map/features/obstacles/ui/controls';
import { explorationModuleOf, resetExploration, toggleExploration } from '../engine/register';
import { EXPLORATION_SHAPES, ExplorationTool, type ExplorationShapeId } from '../engine/tool';
import type { EditOp } from '../engine/commands';

const ICONS: Record<ExplorationShapeId, LucideIcon> = {
  rect: RectangleHorizontal,
  circle: Circle,
  lasso: Lasso,
};

const MODES: readonly { id: EditOp; label: string; tip: string; icon: LucideIcon }[] = [
  { id: 'reveal', label: 'Révéler', tip: 'Ajouter à la mémoire du groupe', icon: Eye },
  { id: 'forget', label: 'Oublier', tip: 'Retirer de la mémoire du groupe', icon: EyeOff },
];

export function ExplorationOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = engine.tools.active;
  const module = explorationModuleOf(engine);
  if (!(tool instanceof ExplorationTool) || !module) return null;
  return <Options engine={engine} tool={tool} />;
}

function Options({ engine, tool }: Readonly<{ engine: MapEngine; tool: ExplorationTool }>) {
  const module = explorationModuleOf(engine)!;
  const shape = useStore(tool.settings, (s) => s.shape);
  const mode = useStore(tool.settings, (s) => s.mode);
  const enabled = useStore(module.model.ui, (s) => s.enabled);
  const known = useStore(module.model.ui, (s) => s.version !== null);
  const ready = enabled && known;

  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
      <Info texte="Mémoire de ce que le groupe a vu sur cette scène">
        <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-muted-foreground">
          <Switch
            checked={enabled}
            aria-label="Exploration de la scène"
            onCheckedChange={(on) => {
              void toggleExploration(engine, on);
              focusMap(engine);
            }}
          />
          Exploration
        </label>
      </Info>

      <OptionSeparator />
      <div role="group" aria-label="Forme" className="flex items-center gap-0.5">
        {EXPLORATION_SHAPES.map((s) => {
          const Icon = ICONS[s.id];
          return (
            <OptionButton
              key={s.id}
              label={s.label}
              shortcut={s.key}
              active={shape === s.id}
              disabled={!ready}
              onClick={() => {
                tool.setShape(s.id, engine);
                focusMap(engine);
              }}
            >
              <Icon />
            </OptionButton>
          );
        })}
      </div>

      <OptionSeparator />
      <div
        role="radiogroup"
        aria-label="Mode"
        className="flex items-center rounded-lg border border-border p-0.5"
      >
        {MODES.map((m) => (
          <Info key={m.id} texte={`${m.tip} (Alt : l’inverse)`}>
            <button
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              disabled={!ready}
              onClick={() => {
                tool.settings.setState({ mode: m.id });
                focusMap(engine);
              }}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors',
                'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                'disabled:pointer-events-none disabled:opacity-50',
                mode === m.id && 'bg-primary/15 text-primary',
              )}
            >
              <m.icon className="size-3.5" />
              {m.label}
            </button>
          </Info>
        ))}
      </div>

      <OptionSeparator />
      <Info texte="Oublier tout ce que le groupe a exploré sur cette scène">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 px-2"
          disabled={!ready}
          onClick={() => void resetExploration(engine)}
        >
          <RotateCcw />
          Réinitialiser
        </Button>
      </Info>
    </div>
  );
}
