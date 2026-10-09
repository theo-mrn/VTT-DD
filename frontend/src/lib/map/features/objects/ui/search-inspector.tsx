'use client';

/**
 * Inspecteur d'un objet, section « Fouille » (MJ ; docs/carte.md § 10) : ouvrir la fouille aux
 * joueurs, sa portée (en unités de jeu, du centre du token au bord de l'objet) et le contenu.
 */
import { translate } from '@/i18n/runtime';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { deepEqual } from '@/lib/map/store/commands';
import { setSearchable, updateObjects } from '../engine/placement';
import {
  DEFAULT_SEARCH_RADIUS,
  itemsOf,
  MAX_SEARCH_RADIUS,
  type ObjectData,
} from '../engine/types';
import { ContentsEditor } from './contents-editor';
import { CommitNumber, FieldLabel, ToggleRow } from './fields';
import { useDistanceScale } from '@/components/map/use-distance';

export function SearchInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const entity = entities[0]!;
  const o = entity.data as ObjectData;
  const scale = useDistanceScale();
  const radius = o.searchRadius ?? DEFAULT_SEARCH_RADIUS;

  return (
    <div className="space-y-4">
      <ToggleRow
        label={translate('map.objects.playersCanSearch')}
        hint={translate('map.objects.searchableHint')}
        checked={o.searchable === true}
        onChange={(on) => void setSearchable(engine, [entity], on)}
      />
      <div className="space-y-1.5">
        <FieldLabel htmlFor={`search-radius-${entity.id}`}>
          {translate('map.objects.reach')}
        </FieldLabel>
        <div className="flex items-center gap-2">
          <CommitNumber
            id={`search-radius-${entity.id}`}
            value={radius * scale.unitsPerCell}
            min={0}
            max={MAX_SEARCH_RADIUS * scale.unitsPerCell}
            step={0.5}
            suffix={scale.unitName}
            className="w-28"
            onCommit={(r) =>
              void updateObjects(engine, translate('map.objects.searchReach'), [entity], (x) => ({
                ...x,
                searchRadius: r / scale.unitsPerCell,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">{translate('map.objects.reachHint')}</p>
        </div>
      </div>
      <ContentsEditor
        items={itemsOf(o)}
        onChange={(items, label) =>
          void updateObjects(engine, label, [entity], (x) =>
            deepEqual(itemsOf(x), items) ? x : { ...x, items },
          )
        }
      />
    </div>
  );
}
