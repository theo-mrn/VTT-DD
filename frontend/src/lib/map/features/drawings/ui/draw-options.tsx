'use client';

/**
 * Barre contextuelle de l'outil Dessin (P) : forme (main levée, ligne, rectangle, ellipse,
 * gomme ; touches 1 à 5), couleur et opacité, épaisseur, remplissage, destination (annotation
 * ou calque), et « Effacer mes dessins » / « Tout effacer » (MJ). Les réglages sont mémorisés.
 */
import { translate } from '@/i18n/runtime';
import {
  Circle,
  Eraser,
  Minus,
  PaintBucket,
  Pencil,
  Square,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { clearDrawings } from '../engine/operations';
import { OPACITY_RANGE, WIDTH_PRESETS, WIDTH_RANGE, withAlpha } from '../engine/palette';
import type { DrawShape } from '../engine/settings';
import { DRAWINGS_COLLECTION } from '../engine/types';
import { useMapState } from '@/components/map/engine-context';
import { ColorDot, ColorPalette } from './color-palette';
import { OptionButton, OptionSeparator, RangeSetting, TargetMenu } from './option-controls';
import { useDrawingsRuntime, useDrawSettings } from './use-drawings';

/** Formes de l'outil ; nom affiché : `map.drawings.shapes.<id>`. */
const SHAPES: readonly { id: DrawShape; icon: LucideIcon; key: string }[] = [
  { id: 'pen', icon: Pencil, key: '1' },
  { id: 'line', icon: Minus, key: '2' },
  { id: 'rectangle', icon: Square, key: '3' },
  { id: 'circle', icon: Circle, key: '4' },
  { id: 'eraser', icon: Eraser, key: '5' },
];

export function DrawOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const rt = useDrawingsRuntime(engine);
  const shape = useDrawSettings(engine, (s) => s.shape);
  const color = useDrawSettings(engine, (s) => s.color);
  const opacity = useDrawSettings(engine, (s) => s.opacity);
  const width = useDrawSettings(engine, (s) => s.width);
  const fill = useDrawSettings(engine, (s) => s.fill);
  const target = useDrawSettings(engine, (s) => s.target);
  const patch = rt.settings.patch;
  const eraser = shape === 'eraser';
  const closedShape = shape === 'rectangle' || shape === 'circle';
  const focusMap = () => engine.canvas?.parentElement?.focus({ preventScroll: true });

  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
      <div
        role="group"
        aria-label={translate('map.fog.shape')}
        className="flex items-center gap-0.5"
      >
        {SHAPES.map((s) => (
          <OptionButton
            key={s.id}
            label={translate(`map.drawings.shapes.${s.id}`)}
            shortcut={s.key}
            active={shape === s.id}
            onClick={() => {
              patch({ shape: s.id });
              focusMap();
            }}
          >
            <s.icon />
          </OptionButton>
        ))}
      </div>

      <OptionSeparator />

      {eraser ? (
        <p className="px-2 text-xs text-muted-foreground">
          Glissez sur les tracés à effacer ; Échap les rend.
        </p>
      ) : (
        <>
          <Popover>
            <Info texte={translate('map.drawings.colorOpacity')}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={translate('map.drawings.colorOpacity')}
                >
                  <ColorDot color={withAlpha(color, opacity)} className="size-5" />
                </Button>
              </PopoverTrigger>
            </Info>
            <PopoverContent side="top" className="w-auto space-y-4 p-3">
              <ColorPalette value={color} onChange={(hex) => patch({ color: hex })} />
              <RangeSetting
                label={translate('map.grid.opacity')}
                value={Math.round(opacity * 100)}
                min={OPACITY_RANGE.min * 100}
                max={OPACITY_RANGE.max * 100}
                step={OPACITY_RANGE.step * 100}
                unit="%"
                onChange={(v) => patch({ opacity: v / 100 })}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <Info texte={translate('map.grid.thickness')}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={translate('map.grid.thickness')}
                  className="gap-1.5 px-2"
                >
                  <StrokeSample width={width} color={withAlpha(color, opacity)} />
                  <span className="font-mono text-xs tabular-nums">{width}</span>
                </Button>
              </PopoverTrigger>
            </Info>
            <PopoverContent side="top" className="w-64 p-3">
              <RangeSetting
                label={translate('map.grid.thickness')}
                value={width}
                min={WIDTH_RANGE.min}
                max={WIDTH_RANGE.max}
                step={WIDTH_RANGE.step}
                unit="px"
                presets={WIDTH_PRESETS}
                onChange={(v) => patch({ width: v })}
              />
            </PopoverContent>
          </Popover>

          {closedShape && (
            <OptionButton
              label={fill ? translate('map.drawings.filled') : translate('map.drawings.noFill')}
              active={fill}
              onClick={() => patch({ fill: !fill })}
            >
              <PaintBucket />
            </OptionButton>
          )}

          <OptionSeparator />
          <TargetMenu engine={engine} value={target} onChange={(t) => patch({ target: t })} />
        </>
      )}

      <OptionSeparator />
      <ClearMenu engine={engine} />
    </div>
  );
}

/** Aperçu du trait (épaisseur bornée pour tenir dans le bouton). */
function StrokeSample({ width, color }: Readonly<{ width: number; color: string }>) {
  return (
    <span aria-hidden className="grid h-4 w-5 place-items-center">
      <span
        className="block w-5 rounded-full"
        style={{ height: Math.max(1, Math.min(12, width / 2)), backgroundColor: color }}
      />
    </span>
  );
}

/** « Effacer mes dessins », « Tout effacer » (MJ) : annulables (⌘Z). */
function ClearMenu({ engine }: Readonly<{ engine: MapEngine }>) {
  const rt = useDrawingsRuntime(engine);
  const drawings = useMapState((s) => s.collections[DRAWINGS_COLLECTION]);
  const gm = engine.viewer.role === 'gm';
  const counts = useMemo(() => {
    let mine = 0;
    let all = 0;
    for (const d of drawings?.values() ?? []) {
      all += 1;
      if (d.createdBy === engine.viewer.userId) mine += 1;
    }
    return { mine, all };
  }, [drawings, engine]);

  return (
    <DropdownMenu>
      <Info texte={translate('map.drawings.erase')}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={translate('map.drawings.eraseSome')}>
            <Trash2 />
          </Button>
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent side="top" align="end" className="w-60">
        <DropdownMenuLabel>{translate('map.drawings.erase')}</DropdownMenuLabel>
        <DropdownMenuItem disabled={!counts.mine} onSelect={() => void clearDrawings(rt, 'mine')}>
          <Eraser />
          {translate('map.drawings.eraseMine')}
          <span className="ml-auto font-mono text-xs tabular-nums text-subtle">{counts.mine}</span>
        </DropdownMenuItem>
        {gm && (
          <DropdownMenuItem
            disabled={!counts.all}
            onSelect={() => void clearDrawings(rt, 'all')}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive [&>svg]:text-destructive"
          >
            <Trash2 />
            {translate('map.drawings.eraseAllEllipsis')}
            <span className="ml-auto font-mono text-xs tabular-nums">{counts.all}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
