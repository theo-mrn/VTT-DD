'use client';

/**
 * Barre contextuelle de l'outil Texte (T) : couleur, taille, police, destination (annotation
 * ou calque). S'applique aux nouveaux textes ; un texte posé se règle dans l'inspecteur.
 */
import { ALargeSmall, Type } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { useCampagne } from '@/lib/campagnes';
import {
  FONT_SIZE_PRESETS,
  FONT_SIZE_RANGE,
  NOTE_FONT_GROUPS,
  NOTE_FONTS,
  noteFontOf,
  systemNoteFont,
  type NoteFont,
} from '@/lib/map/modules/drawings/palette';
import { useSystemFontFamilies } from '@/lib/system-fonts';
import { useSysteme } from '@/lib/systemes';
import { ColorDot, ColorPalette } from './color-palette';
import { OptionSeparator, RangeSetting, TargetMenu } from './option-controls';
import { useMapEngine } from '../engine-context';
import { useDrawingsRuntime, useDrawSettings } from './use-drawings';

export function TextOptions({ engine }: Readonly<{ engine: MapEngine }>) {
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
}: Readonly<{
  color: string;
  fontSize: number;
  fontFamily: string | null;
  disabled?: boolean;
  onColor(hex: string): void;
  onFontSize(size: number): void;
  /** Fin du réglage (inspecteur : une seule commande). */
  onFontSizeCommit?(size: number): void;
  onFont(font: string): void;
}>) {
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

      <FontMenu fontFamily={fontFamily} disabled={disabled} onFont={onFont} />
    </div>
  );
}

/** Polices du système de la campagne (déclarées au navigateur), en tête du sélecteur. */
function useSystemNoteFonts(): NoteFont[] {
  const engine = useMapEngine();
  const campagne = useCampagne(engine.store.getState().campaignId);
  const systemId = campagne.data?.system ?? null;
  const systeme = useSysteme(systemId);
  const families = useSystemFontFamilies(systemId, systeme.data?.presentation ?? null);
  return useMemo(() => families.map(systemNoteFont), [families]);
}

/** Choix de la police : celles du système, puis le catalogue par groupes, chacune en elle-même. */
function FontMenu({
  fontFamily,
  disabled,
  onFont,
}: Readonly<{
  fontFamily: string | null;
  disabled?: boolean;
  onFont(font: string): void;
}>) {
  const system = useSystemNoteFonts();
  const font = noteFontOf(fontFamily, system);
  const groups = useMemo(
    () =>
      [
        { title: 'Polices du système', fonts: system },
        ...NOTE_FONT_GROUPS.map((g) => ({
          title: g,
          fonts: NOTE_FONTS.filter((f) => f.group === g),
        })),
      ].filter((g) => g.fonts.length),
    [system],
  );
  return (
    <DropdownMenu>
      <Info texte="Police">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled} className="max-w-40 px-2">
            <span
              className="truncate"
              style={{ fontFamily: font?.value ?? fontFamily ?? undefined }}
            >
              {font?.label ?? 'Police'}
            </span>
          </Button>
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent side="top" className="max-h-[min(28rem,70vh)] w-56 overflow-y-auto">
        <DropdownMenuRadioGroup value={font?.value ?? ''} onValueChange={onFont}>
          {groups.map((g, i) => (
            <div key={g.title}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                {g.title}
              </DropdownMenuLabel>
              {g.fonts.map((f) => (
                <DropdownMenuRadioItem key={f.id} value={f.value}>
                  <span
                    className="truncate text-[15px] text-foreground"
                    style={{ fontFamily: f.value }}
                  >
                    {f.label}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </div>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
