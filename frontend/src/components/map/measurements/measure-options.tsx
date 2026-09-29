'use client';

/**
 * Barre contextuelle de l'outil Mesurer (Z, docs/carte.md § 10, Mesures) : forme (1 à 4),
 * couleur, options du cône, effet animé, « Épingler au lâcher », « Visible des joueurs » (MJ),
 * comptage des cases, effacement des gabarits, et rappel des gestes. Réglages gardés dans le
 * navigateur.
 */
import {
  Circle,
  Eye,
  EyeOff,
  Flame,
  Grid3x3,
  Minus,
  Palette,
  Pin,
  PinOff,
  Square,
  Trash2,
  Triangle,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { MeasureModule } from '@/lib/map/modules/measurements/context';
import {
  GRID_COUNTINGS,
  MEASURE_COLORS,
  MEASURE_SHAPES,
  type MeasureShape,
} from '@/lib/map/modules/measurements/model';
import { clearTemplates } from '@/lib/map/modules/measurements/operations';
import { setGridCounting } from '@/lib/map/modules/measurements/prefs';
import { measureModuleOf } from '@/lib/map/modules/measurements/register';
import { skinFor } from '@/lib/map/modules/measurements/settings';
import { skinnable } from '@/lib/map/modules/measurements/skins';
import { MeasureTool } from '@/lib/map/modules/measurements/tool';
import { cn } from '@/lib/utils';
import { focusMap, OptionButton, OptionSeparator, Swatches } from '../obstacles/controls';
import { ConeSettings, SkinPicker } from './measure-controls';

const SHAPE_ICONS: Record<MeasureShape, ComponentType<{ className?: string }>> = {
  line: Minus,
  cone: Triangle,
  circle: Circle,
  cube: Square,
};

export function MeasureOptions({ engine }: { engine: MapEngine }) {
  const ctx = measureModuleOf(engine);
  if (!(engine.tools.active instanceof MeasureTool) || !ctx) return null;
  return <Options engine={engine} ctx={ctx} />;
}

function Options({ engine, ctx }: { engine: MapEngine; ctx: MeasureModule }) {
  const s = useStore(ctx.settings);
  const counting = useStore(ctx.prefs, (p) => p.counting);
  const set = ctx.settings.setState;
  const gm = engine.viewer.role === 'gm';
  const unit = engine.kindContext().unitName;
  const skin = skinFor(s, s.shape);

  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        {MEASURE_SHAPES.map((shape) => {
          const Icon = SHAPE_ICONS[shape.value];
          return (
            <OptionButton
              key={shape.value}
              label={shape.label}
              shortcut={shape.key}
              active={s.shape === shape.value}
              onClick={() => {
                set({ shape: shape.value });
                focusMap(engine);
              }}
            >
              <Icon />
            </OptionButton>
          );
        })}
        <OptionSeparator />

        <Popover>
          <Info texte="Couleur">
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label="Couleur">
                <span
                  aria-hidden
                  className="size-4 rounded-full border border-border-strong"
                  style={{ backgroundColor: s.color }}
                />
                <Palette />
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent side="top" className="w-72 p-3">
            <Swatches
              value={s.color}
              options={MEASURE_COLORS}
              onChange={(c) => c && set({ color: c })}
            />
          </PopoverContent>
        </Popover>

        {s.shape === 'cone' && (
          <Popover>
            <Info texte="Cône">
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 px-2" aria-label="Cône">
                  <Triangle />
                  <span className="text-xs tabular-nums">
                    {s.cone.mode === 'angle'
                      ? `${Math.round(s.cone.angle)}°`
                      : s.cone.width
                        ? `${s.cone.width.toLocaleString('fr-FR')} ${unit}`
                        : 'Dim.'}
                  </span>
                </Button>
              </PopoverTrigger>
            </Info>
            <PopoverContent side="top" className="w-72 p-3">
              <ConeSettings value={s.cone} unit={unit} onChange={(cone) => set({ cone })} />
            </PopoverContent>
          </Popover>
        )}

        {skinnable(s.shape) && (
          <Popover>
            <Info texte={skin ? 'Effet animé' : 'Effet animé : aucun'}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Effet animé"
                  className={cn(skin && 'text-primary')}
                >
                  <Flame />
                </Button>
              </PopoverTrigger>
            </Info>
            <PopoverContent side="top" className="w-80 p-3">
              <p className="mb-2 text-sm font-semibold">Effet animé</p>
              <SkinPicker
                engine={engine}
                shape={s.shape}
                value={skin}
                onChange={(v) =>
                  set({
                    skins: { ...s.skins, [s.shape === 'circle' ? 'circle' : 'cone']: v },
                  })
                }
              />
            </PopoverContent>
          </Popover>
        )}
        <OptionSeparator />

        <OptionButton
          label={
            s.pinOnRelease
              ? 'Épingler au lâcher : le gabarit reste'
              : 'Mesure éphémère : elle s’efface après 6 s (Entrée : épingler)'
          }
          active={s.pinOnRelease}
          onClick={() => set({ pinOnRelease: !s.pinOnRelease })}
        >
          {s.pinOnRelease ? <Pin /> : <PinOff />}
        </OptionButton>
        {gm && (
          <OptionButton
            label={s.shared ? 'Mesure visible des joueurs' : 'Mesure pour les MJ seulement'}
            active={s.shared}
            onClick={() => set({ shared: !s.shared })}
          >
            {s.shared ? <Eye /> : <EyeOff />}
          </OptionButton>
        )}

        <Popover>
          <Info texte="Comptage des cases">
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Comptage des cases"
                className={cn(counting !== 'off' && 'text-primary')}
              >
                <Grid3x3 />
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent side="top" className="w-72 p-2">
            <p className="px-2 pb-1 pt-1 text-sm font-semibold">Comptage des cases</p>
            <div role="radiogroup" aria-label="Comptage des cases" className="space-y-0.5">
              {GRID_COUNTINGS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={c.value === counting}
                  onClick={() => setGridCounting(engine, c.value)}
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    c.value === counting && 'text-primary',
                  )}
                >
                  <span className="block text-[13px] font-medium">{c.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{c.hint}</span>
                </button>
              ))}
            </div>
            <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">
              Avec une grille de jeu, les mesures disent aussi le nombre de cases à parcourir.
              Réglage de votre écran seulement.
            </p>
          </PopoverContent>
        </Popover>

        <Popover>
          <Info texte="Effacer des gabarits">
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Effacer des gabarits">
                <Trash2 />
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent side="top" className="w-60 space-y-1 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => void clearTemplates(ctx, false)}
            >
              Effacer mes gabarits
            </Button>
            {gm && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full justify-start"
                onClick={() => void clearTemplates(ctx, true)}
              >
                Effacer tous les gabarits
              </Button>
            )}
            <p className="px-2 pt-1 text-[11px] text-muted-foreground">⌘Z les fait revenir.</p>
          </PopoverContent>
        </Popover>
      </div>
      <p className="max-w-[36rem] px-2 text-center text-[11px] leading-snug text-muted-foreground">
        Glisser : mesurer (Alt : sans aimantation, ⇧ : par 15°). Entrée : épingler la dernière
        mesure. 1 à 4 : forme. Un gabarit sélectionné se règle par la poignée de son bout.
      </p>
    </div>
  );
}
