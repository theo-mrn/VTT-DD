'use client';

/**
 * Barre contextuelle de l'outil Brouillard (G), seul outil du MJ pour ce que les joueurs voient
 * de la carte (docs/carte.md § 10, docs/exploration.md § 5.4) :
 * - la forme (touches 1 à 4 ; la Sélection ne touche que les zones de brouillard) ;
 * - Brouillard : ajouter ou retirer ;
 * - Mémoire des joueurs (ce qu'ils ont déjà vu, en gris) : allumée ou coupée pour la scène, et,
 *   allumée, marquer une zone comme vue ou la faire oublier ;
 * - « … » : tout couvrir, tout découvrir, effacer la mémoire.
 * Alt inverse le geste le temps du geste. Aucun texte d'aide : des infobulles.
 */
import { lazyLabels, translate } from '@/i18n/runtime';
import {
  Circle,
  Cloud,
  CloudFog,
  CloudOff,
  Eraser,
  Eye,
  EyeOff,
  Lasso,
  MoreHorizontal,
  MousePointer2,
  RectangleHorizontal,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { useMapState } from '@/components/map/engine-context';
import {
  explorationModuleOf,
  resetExploration,
  toggleExploration,
} from '@/lib/map/features/exploration/engine/register';
import { focusMap, OptionButton, OptionSeparator } from '@/lib/map/features/obstacles/ui/controls';
import { cn } from '@/lib/utils';
import { FOG_ZONES } from '../engine/model';
import { setFogFull } from '../engine/register';
import { FOG_SHAPES, FogTool, isMemoryMode, type FogShape, type FogToolMode } from '../engine/tool';

const SHAPE_ICONS: Record<FogShape, LucideIcon> = {
  rect: RectangleHorizontal,
  circle: Circle,
  lasso: Lasso,
  select: MousePointer2,
};

/** Gestes : icône, libellé court et infobulle. */
const MODE_ICONS: Record<FogToolMode, LucideIcon> = {
  fog: CloudFog,
  clear: Eraser,
  reveal: Eye,
  forget: EyeOff,
};
const MODE_LABELS = lazyLabels<FogToolMode>({
  fog: 'map.fog.add',
  clear: 'map.fog.remove',
  reveal: 'map.fog.memory.reveal.label',
  forget: 'map.fog.memory.forget.label',
});
const MODE_HINTS = lazyLabels<FogToolMode>({
  fog: 'map.fog.modes.fog',
  clear: 'map.fog.modes.clear',
  reveal: 'map.fog.memory.reveal.hint',
  forget: 'map.fog.memory.forget.hint',
});

export function FogOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = engine.tools.active;
  if (!(tool instanceof FogTool)) return null;
  return <Options engine={engine} tool={tool} />;
}

function Options({ engine, tool }: Readonly<{ engine: MapEngine; tool: FogTool }>) {
  const shape = useStore(tool.settings, (s) => s.shape);
  const mode = useStore(tool.settings, (s) => s.mode);
  const fogFull = useMapState((s) => s.scene?.fogFull === true);
  const zones = useMapState((s) => s.collections[FOG_ZONES]?.size ?? 0);
  const memory = useMemory(engine);

  // Mémoire coupée pendant un geste sur elle : retour au brouillard
  const effective: FogToolMode = isMemoryMode(mode) && !memory.enabled ? 'fog' : mode;
  const pick = (m: FogToolMode) => {
    tool.setMode(m);
    focusMap(engine);
  };

  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
      <div
        role="group"
        aria-label={translate('map.fog.shape')}
        className="flex items-center gap-0.5"
      >
        {FOG_SHAPES.map((s) => {
          const Icon = SHAPE_ICONS[s.id];
          return (
            <OptionButton
              key={s.id}
              label={translate(`map.fog.shapes.${s.id}.label`)}
              shortcut={s.key}
              active={shape === s.id}
              disabled={s.id === 'select' && isMemoryMode(effective)}
              onClick={() => {
                tool.setShape(s.id);
                focusMap(engine);
              }}
            >
              <Icon />
            </OptionButton>
          );
        })}
      </div>

      <OptionSeparator />
      <Section label={translate('map.fog.fog')}>
        <Segmented modes={['fog', 'clear']} value={effective} onPick={pick} />
      </Section>

      <OptionSeparator />
      <Section label={translate('map.fog.memory.label')}>
        <Info texte={translate('map.fog.memory.hint')}>
          <span className="flex h-8 items-center px-1">
            <Switch
              checked={memory.enabled}
              aria-label={translate('map.fog.memory.label')}
              onCheckedChange={(on) => {
                void toggleExploration(engine, on);
                if (!on && isMemoryMode(mode)) tool.setMode('fog');
                focusMap(engine);
              }}
            />
          </span>
        </Info>
        {memory.enabled && (
          <Segmented modes={['reveal', 'forget']} value={effective} onPick={pick} />
        )}
      </Section>

      <OptionSeparator />
      <DropdownMenu>
        <Info texte={translate('map.fog.more')}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={translate('map.fog.more')}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </Info>
        <DropdownMenuContent side="top" align="end">
          <DropdownMenuItem
            disabled={fogFull && !zones}
            onSelect={() => void setFogFull(engine, true)}
          >
            <Cloud />
            {translate('map.fog.coverAll')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!fogFull && !zones}
            onSelect={() => void setFogFull(engine, false)}
          >
            <CloudOff />
            {translate('map.fog.clearAll')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!memory.enabled || !memory.known}
            onSelect={() => void resetExploration(engine)}
          >
            <RotateCcw />
            {translate('map.fog.memory.reset')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Mémoire de la scène affichée : allumée, et déjà connue (quelque chose à effacer). */
function useMemory(engine: MapEngine) {
  const ui = explorationModuleOf(engine)?.model.ui;
  const enabled = useStore(ui ?? NO_UI, (s) => s.enabled);
  const known = useStore(ui ?? NO_UI, (s) => s.version !== null);
  return { enabled: Boolean(ui) && enabled, known };
}

/** Sans module d'exploration (tests) : mémoire coupée. */
const NO_UI = {
  getState: () => ({ enabled: false, version: null }),
  getInitialState: () => ({ enabled: false, version: null }),
  subscribe: () => () => undefined,
  setState: () => undefined,
} as unknown as NonNullable<ReturnType<typeof explorationModuleOf>>['model']['ui'];

function Section({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5">
      <span className="pl-1 text-[11px] font-medium uppercase tracking-wide text-subtle">
        {label}
      </span>
      {children}
    </div>
  );
}

function Segmented({
  modes,
  value,
  onPick,
}: Readonly<{
  modes: readonly FogToolMode[];
  value: FogToolMode;
  onPick(mode: FogToolMode): void;
}>) {
  return (
    <div role="radiogroup" className="flex items-center rounded-lg border border-border p-0.5">
      {modes.map((m) => {
        const Icon = MODE_ICONS[m];
        return (
          <Info key={m} texte={MODE_HINTS[m]}>
            <button
              type="button"
              role="radio"
              aria-checked={value === m}
              onClick={() => onPick(m)}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors',
                'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                value === m && 'bg-primary/15 text-primary',
              )}
            >
              <Icon className="size-3.5" />
              {MODE_LABELS[m]}
            </button>
          </Info>
        );
      })}
    </div>
  );
}
