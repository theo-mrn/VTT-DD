'use client';

/**
 * Briques des barres contextuelles des outils Dessin et Texte : bouton d'option, séparateur,
 * destination (annotation ou calque), réglage numérique avec préréglages.
 */
import { ChevronDown, Layers, StickyNote } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { EditableValue } from '@/components/ui/editable-value';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { drawingLayer } from '../engine/operations';
import type { DrawTarget } from '../engine/settings';
import { cn } from '@/lib/utils';
import { useMapState, useMapUi } from '@/components/map/engine-context';

export function OptionSeparator() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;
}

export function OptionButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
  className,
}: Readonly<{
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?(): void;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <Info
      texte={
        <span className="flex items-center gap-2">
          {label}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
      }
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
          className,
        )}
      >
        {children}
      </Button>
    </Info>
  );
}

/**
 * Où va ce qu'on pose : annotation (au-dessus de l'ombre, toujours vue) ou calque (fait partie
 * de la carte, sous l'ombre). Le calque est le calque actif, sinon « Sol ».
 */
export function TargetMenu({
  engine,
  value,
  onChange,
}: Readonly<{
  engine: MapEngine;
  value: DrawTarget;
  onChange(target: DrawTarget): void;
}>) {
  // Relu quand les calques ou le calque actif changent
  useMapState((s) => s.collections.layers);
  useMapUi((s) => s.activeLayerId);
  const layer = drawingLayer(engine);
  const effective: DrawTarget = value === 'layer' && layer ? 'layer' : 'annotation';
  const label = effective === 'layer' && layer ? `Calque « ${layer.name} »` : 'Annotation';
  const Icon = effective === 'layer' ? Layers : StickyNote;
  return (
    <DropdownMenu>
      <Info texte="Où poser les dessins et les textes">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="max-w-52 gap-1.5 px-2">
            <Icon />
            <span className="truncate">{label}</span>
            <ChevronDown className="text-subtle" />
          </Button>
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent side="top" align="center" className="w-72">
        <DropdownMenuLabel>Poser dans</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={effective}
          onValueChange={(v) => onChange(v === 'layer' ? 'layer' : 'annotation')}
        >
          <DropdownMenuRadioItem value="annotation" className="items-start">
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground">Annotation</span>
              <span className="text-xs text-muted-foreground">
                Au-dessus de l’ombre : toujours visible de toute la table.
              </span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="layer" disabled={!layer} className="items-start">
            <span className="flex flex-col gap-0.5">
              <span className="text-foreground">
                {layer ? `Calque « ${layer.name} »` : 'Dans un calque'}
              </span>
              <span className="text-xs text-muted-foreground">
                {layer
                  ? 'Fait partie de la carte : sous l’ombre et le brouillard, rangé avec le reste.'
                  : 'Aucun calque déverrouillé sur cette carte.'}
              </span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Réglage numérique : curseur, valeur, préréglages. */
export function RangeSetting({
  label,
  value,
  min,
  max,
  step,
  unit,
  presets,
  format = String,
  disabled,
  onChange,
  onCommit,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  presets?: readonly { label: string; value: number }[];
  format?(v: number): string;
  disabled?: boolean;
  onChange(v: number): void;
  onCommit?(v: number): void;
}>) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums text-foreground">
          <EditableValue
            label={label}
            value={value}
            format={format}
            min={min}
            max={max}
            disabled={disabled}
            onCommit={(v) => {
              onChange(v);
              onCommit?.(v);
            }}
          />
          {unit && <span className="text-subtle"> {unit}</span>}
        </span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        onValueCommit={([v]) => v !== undefined && onCommit?.(v)}
      />
      {presets && (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <Button
              key={p.value}
              type="button"
              variant={p.value === value ? 'secondary' : 'ghost'}
              size="xs"
              disabled={disabled}
              aria-pressed={p.value === value}
              onClick={() => {
                onChange(p.value);
                onCommit?.(p.value);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
