'use client';

/**
 * Barre contextuelle de l'outil Texte (T) : couleur, taille, police, destination (annotation
 * ou calque). S'applique aux nouveaux textes ; un texte posé se règle dans l'inspecteur.
 */
import { ALargeSmall, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import {
  FONT_SIZE_PRESETS,
  FONT_SIZE_RANGE,
  NOTE_FONTS,
  noteFontOf,
} from '@/lib/map/modules/drawings/palette';
import { ColorDot, ColorPalette } from './color-palette';
import { OptionSeparator, RangeSetting, TargetMenu } from './option-controls';
import { useDrawingsRuntime, useDrawSettings } from './use-drawings';

export function TextOptions({ engine }: { engine: MapEngine }) {
  const rt = useDrawingsRuntime(engine);
  const text = useDrawSettings(engine, (s) => s.text);
  const target = useDrawSettings(engine, (s) => s.target);
  const patch = rt.settings.patch;

  return (
    <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
      <p className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
        <Type className="size-3.5" aria-hidden />
        Cliquez sur la carte pour écrire
      </p>
      <OptionSeparator />
      <TextStyleControls
        color={text.color}
        fontSize={text.fontSize}
        fontFamily={text.fontFamily}
        onColor={(color) => patch({ text: { color } })}
        onFontSize={(fontSize) => patch({ text: { fontSize } })}
        onFont={(fontFamily) => patch({ text: { fontFamily } })}
      />
      <OptionSeparator />
      <TargetMenu engine={engine} value={target} onChange={(t) => patch({ target: t })} />
    </div>
  );
}

/** Couleur, taille et police d'un texte (barre de l'outil et inspecteur). */
export function TextStyleControls({
  color,
  fontSize,
  fontFamily,
  disabled,
  onColor,
  onFontSize,
  onFontSizeCommit,
  onFont,
}: {
  color: string;
  fontSize: number;
  fontFamily: string | null;
  disabled?: boolean;
  onColor(hex: string): void;
  onFontSize(size: number): void;
  /** Fin du réglage (inspecteur : une seule commande). */
  onFontSizeCommit?(size: number): void;
  onFont(font: string): void;
}) {
  const font = noteFontOf(fontFamily);
  return (
    <div className="flex items-center gap-1">
      <Popover>
        <Info texte="Couleur du texte">
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Couleur du texte"
              disabled={disabled}
            >
              <ColorDot color={color} className="size-5" />
            </Button>
          </PopoverTrigger>
        </Info>
        <PopoverContent side="top" className="w-auto p-3">
          <ColorPalette value={color} onChange={onColor} label="Couleur du texte" />
        </PopoverContent>
      </Popover>

      <Popover>
        <Info texte="Taille du texte">
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Taille du texte"
              disabled={disabled}
              className="gap-1.5 px-2"
            >
              <ALargeSmall />
              <span className="font-mono text-xs tabular-nums">{Math.round(fontSize)}</span>
            </Button>
          </PopoverTrigger>
        </Info>
        <PopoverContent side="top" className="w-64 p-3">
          <RangeSetting
            label="Taille"
            value={Math.round(fontSize)}
            min={FONT_SIZE_RANGE.min}
            max={FONT_SIZE_RANGE.max}
            step={FONT_SIZE_RANGE.step}
            unit="px"
            presets={FONT_SIZE_PRESETS}
            onChange={onFontSize}
            onCommit={onFontSizeCommit}
          />
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <Info texte="Police">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={disabled} className="px-2">
              <span style={{ fontFamily: font?.value ?? fontFamily ?? undefined }}>
                {font?.label ?? 'Police'}
              </span>
            </Button>
          </DropdownMenuTrigger>
        </Info>
        <DropdownMenuContent side="top" className="w-48">
          <DropdownMenuLabel>Police</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={font?.value ?? ''} onValueChange={onFont}>
            {NOTE_FONTS.map((f) => (
              <DropdownMenuRadioItem key={f.id} value={f.value}>
                <span className="text-sm text-foreground" style={{ fontFamily: f.value }}>
                  {f.label}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
