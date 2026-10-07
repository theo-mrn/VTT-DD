'use client';

/**
 * Inspecteur d'un gabarit épinglé (auteur ou MJ) : longueur et direction, couleur, options du
 * cône, effet animé. Chaque réglage est une commande annulable, pour toute la sélection.
 */
import { translate } from '@/i18n/runtime';
import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import {
  coneOptions,
  measureColorOptions,
  measureShapeLabel,
  reach,
  withCone,
  type MeasurementData,
} from '../engine/model';
import { updateTemplates } from '../engine/operations';
import { measureModuleOf } from '../engine/register';
import { skinnable } from '../engine/skins';
import { FieldRow, Swatches } from '@/lib/map/features/obstacles/ui/controls';
import { ConeSettings, SkinPicker } from './measure-controls';

const round = (n: number) => Math.round(n * 100) / 100;

/** Champ numérique validé à la sortie ou par Entrée. */
function NumberField({
  id,
  value,
  suffix,
  onCommit,
}: Readonly<{
  id: string;
  value: number;
  suffix: string;
  onCommit(v: number): void;
}>) {
  const shown = String(round(value)).replace('.', ',');
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    const n = Number(text.replace(',', '.'));
    if (Number.isFinite(n) && round(n) !== round(value)) onCommit(n);
    else setText(shown);
  };
  return (
    <div className="flex items-center gap-1.5">
      <Input
        id={id}
        inputMode="decimal"
        className="h-8 w-20 text-right tabular-nums"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
    </div>
  );
}

export function MeasureInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const ctx = measureModuleOf(engine);
  const id = useId();
  const first = entities[0]?.data as MeasurementData | undefined;
  if (!ctx || !first) return null;
  const items = entities.map((e) => e.data as MeasurementData);
  const single = items.length === 1 ? first : null;
  const shapes = new Set(items.map((m) => m.shape));
  const shape = shapes.size === 1 ? first.shape : null;
  const ppu = engine.kindContext().pixelsPerUnit || 50;
  const unit = engine.kindContext().unitName;
  const patch = (label: string, fn: (m: MeasurementData) => MeasurementData) =>
    void updateTemplates(ctx, label, entities, fn);
  const sameColor = items.every((m) => m.color === first.color) ? first.color : '';
  const r = single ? reach(single) : null;

  /** Nouvelle extrémité : même origine, longueur (unités) et direction (degrés). */
  const endFor = (m: MeasurementData, lengthUnits: number, degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    const l = Math.max(0.1, lengthUnits) * ppu;
    return { x: round(m.start.x + Math.cos(a) * l), y: round(m.start.y + Math.sin(a) * l) };
  };

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        {shape ? measureShapeLabel(shape) : translate('map.measurements.templates')}
        {items.length > 1 ? ` · ${items.length}` : ''}
      </p>
      {single && r && (
        <>
          <FieldRow label={lengthLabel(single.shape)} htmlFor={`${id}-length`}>
            <NumberField
              id={`${id}-length`}
              value={r.length / ppu}
              suffix={unit}
              onCommit={(v) =>
                patch(translate('map.measurements.templateLength'), (m) => ({
                  ...m,
                  end: endFor(m, v, (reach(m).angle * 180) / Math.PI),
                }))
              }
            />
          </FieldRow>
          {single.shape !== 'circle' && (
            <FieldRow label={translate('map.measurements.direction')} htmlFor={`${id}-angle`}>
              <NumberField
                id={`${id}-angle`}
                value={((((r.angle * 180) / Math.PI) % 360) + 360) % 360}
                suffix="°"
                onCommit={(v) =>
                  patch(translate('map.measurements.templateDirection'), (m) => ({
                    ...m,
                    end: endFor(m, reach(m).length / ppu, v),
                  }))
                }
              />
            </FieldRow>
          )}
        </>
      )}
      <div className="space-y-1.5">
        <span className="text-[13px] text-foreground">{translate('map.lights.color')}</span>
        <Swatches
          value={sameColor}
          options={measureColorOptions()}
          onChange={(c) =>
            c && patch(translate('map.measurements.templateColor'), (m) => ({ ...m, color: c }))
          }
        />
      </div>
      {shape === 'cone' && (
        <div className="space-y-1.5">
          <span className="text-[13px] text-foreground">
            {translate('map.measurements.shapes.cone')}
          </span>
          <ConeSettings
            value={coneOptions(first.options)}
            unit={unit}
            onChange={(cone) =>
              patch(translate('map.measurements.templateCone'), (m) => ({
                ...m,
                options: withCone(m.options, cone),
              }))
            }
          />
        </div>
      )}
      {shape && skinnable(shape) && (
        <div className="space-y-1.5">
          <span className="text-[13px] text-foreground">
            {translate('map.measurements.effect')}
          </span>
          <SkinPicker
            engine={engine}
            shape={shape}
            value={items.every((m) => m.skin === first.skin) ? first.skin : null}
            onChange={(skin) =>
              patch(translate('map.measurements.templateEffect'), (m) => ({ ...m, skin }))
            }
          />
        </div>
      )}
    </div>
  );
}

const lengthLabel = (shape: string) =>
  shape === 'circle'
    ? translate('map.measurements.radius')
    : shape === 'cube'
      ? translate('map.measurements.halfSide')
      : translate('map.measurements.length');
