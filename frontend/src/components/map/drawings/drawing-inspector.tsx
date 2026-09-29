'use client';

/**
 * Sections de l'inspecteur pour les dessins (« Trait ») et les textes (« Texte ») : couleur,
 * opacité, épaisseur, remplissage ; texte, taille, police. Chaque réglage est une commande
 * annulable, envoyée à la fin du geste (un curseur ne produit qu'une commande). Lecture seule
 * pour qui n'est ni l'auteur ni le MJ.
 */
import { Layers2, PenLine } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { InspectorSectionProps, MapEngine } from '@/lib/map/engine/map-engine';
import { moveToAnnotations, updateItems } from '@/lib/map/modules/drawings/operations';
import {
  fillFor,
  OPACITY_RANGE,
  parseColor,
  WIDTH_PRESETS,
  WIDTH_RANGE,
  withAlpha,
} from '@/lib/map/modules/drawings/palette';
import { isClosedShape, shapeOf } from '@/lib/map/modules/drawings/shapes';
import type { DrawingData, NoteData } from '@/lib/map/modules/drawings/types';
import type { MapDto } from '@/lib/map/store/map-store';
import { ColorPalette } from './color-palette';
import { RangeSetting } from './option-controls';
import { TextStyleControls } from './text-options';
import { useDrawingsRuntime } from './use-drawings';

const editable = (engine: MapEngine, entities: readonly MapEntity[]) =>
  entities.length > 0 && entities.every((e) => e.kind.can('move', e, engine.viewer));

/** Même couleur, autre opacité ; le remplissage suit. */
function recolor(d: MapDto, hex: string, alpha: number): MapDto {
  const color = withAlpha(hex, alpha);
  const fill = typeof d.fill === 'string' && d.fill ? fillFor(color) : d.fill;
  return { ...d, color, fill };
}

function Placement({ engine, entities }: { engine: MapEngine; entities: readonly MapEntity[] }) {
  const layered = entities.filter((e) => e.layerId !== null);
  const layer = layered.length === entities.length ? engine.layer(layered[0]!.layerId) : null;
  const author = entities.length === 1 ? String(entities[0]!.data.createdBy ?? '') : '';
  const authorName = author ? (engine.directory.userName(author) ?? null) : null;
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p>
        {layered.length === 0
          ? 'Annotation : au-dessus de l’ombre, vue de toute la table.'
          : layer && new Set(layered.map((e) => e.layerId)).size === 1
            ? `Dans le calque « ${layer.name} ».`
            : 'Dans des calques de la carte.'}
        {authorName && <> Par {authorName}.</>}
      </p>
      {layered.length > 0 && editable(engine, layered) && (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => void moveToAnnotations(engine, layered)}
        >
          <Layers2 />
          Passer en annotation
        </Button>
      )}
    </div>
  );
}

export function DrawingInspector({ engine, entities }: InspectorSectionProps) {
  const rt = useDrawingsRuntime(engine);
  const [opacityDraft, setOpacityDraft] = useState<number | null>(null);
  const [widthDraft, setWidthDraft] = useState<number | null>(null);
  const first = entities[0]?.data as DrawingData | undefined;
  if (!first) return null;
  const canEdit = editable(engine, entities);
  const parsed = parseColor(first.color);
  const hex = parsed?.hex ?? first.color;
  const alpha = parsed?.alpha ?? 1;
  const closed = entities.every((e) => isClosedShape(shapeOf(e.data as DrawingData)));
  const filled = entities.every((e) => typeof e.data.fill === 'string' && e.data.fill.length > 0);

  const update = (label: string, change: (d: MapDto) => MapDto) =>
    void updateItems(rt, label, entities, change);

  return (
    <div className="space-y-4">
      <fieldset disabled={!canEdit} className="space-y-4 disabled:opacity-60">
        <ColorPalette
          value={hex}
          onChange={(h) =>
            update('Couleur', (d) => recolor(d, h, parseColor(String(d.color))?.alpha ?? 1))
          }
        />
        <RangeSetting
          label="Opacité"
          value={Math.round((opacityDraft ?? alpha) * 100)}
          min={OPACITY_RANGE.min * 100}
          max={OPACITY_RANGE.max * 100}
          step={OPACITY_RANGE.step * 100}
          unit="%"
          onChange={(v) => setOpacityDraft(v / 100)}
          onCommit={(v) => {
            setOpacityDraft(null);
            update('Opacité', (d) => recolor(d, parseColor(String(d.color))?.hex ?? hex, v / 100));
          }}
        />
        <RangeSetting
          label="Épaisseur"
          value={widthDraft ?? first.width}
          min={WIDTH_RANGE.min}
          max={WIDTH_RANGE.max}
          step={WIDTH_RANGE.step}
          unit="px"
          presets={WIDTH_PRESETS}
          onChange={setWidthDraft}
          onCommit={(v) => {
            setWidthDraft(null);
            update('Épaisseur', (d) => (d.width === v ? d : { ...d, width: v }));
          }}
        />
        {closed && (
          <label className="flex items-center justify-between gap-3 text-[13px]">
            Remplie
            <Switch
              checked={filled}
              onCheckedChange={(on) =>
                update(on ? 'Remplir' : 'Sans remplissage', (d) => ({
                  ...d,
                  fill: on ? fillFor(String(d.color)) : null,
                }))
              }
            />
          </label>
        )}
      </fieldset>
      <Placement engine={engine} entities={entities} />
    </div>
  );
}

export function NoteInspector({ engine, entities }: InspectorSectionProps) {
  const rt = useDrawingsRuntime(engine);
  const first = entities[0]?.data as NoteData | undefined;
  const [sizeDraft, setSizeDraft] = useState<number | null>(null);
  const [textDraft, setTextDraft] = useState<string | null>(null);
  if (!first) return null;
  const canEdit = editable(engine, entities);
  const single = entities.length === 1 ? entities[0]! : null;
  const update = (label: string, change: (d: MapDto) => MapDto) =>
    void updateItems(rt, label, entities, change);

  const commitText = () => {
    const text = textDraft;
    setTextDraft(null);
    if (text === null || !text.trim() || text === first.text) return;
    update('Modifier le texte', (d) => ({ ...d, text }));
  };

  return (
    <div className="space-y-3">
      {single && (
        <div className="space-y-2">
          <Textarea
            aria-label="Texte"
            value={textDraft ?? first.text}
            disabled={!canEdit}
            maxLength={5000}
            onChange={(e) => setTextDraft(e.target.value)}
            onBlur={commitText}
            className="min-h-[72px] text-sm"
          />
          {canEdit && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                engine.closeInspector();
                rt.editor.openExisting(single);
              }}
            >
              <PenLine />
              Modifier sur la carte
            </Button>
          )}
        </div>
      )}
      <TextStyleControls
        color={first.color}
        fontSize={sizeDraft ?? first.fontSize}
        fontFamily={first.fontFamily}
        disabled={!canEdit}
        onColor={(hex) => update('Couleur', (d) => ({ ...d, color: hex }))}
        onFontSize={setSizeDraft}
        onFontSizeCommit={(size) => {
          setSizeDraft(null);
          update('Taille du texte', (d) => (d.fontSize === size ? d : { ...d, fontSize: size }));
        }}
        onFont={(font) => update('Police', (d) => ({ ...d, fontFamily: font }))}
      />
      <Placement engine={engine} entities={entities} />
    </div>
  );
}
