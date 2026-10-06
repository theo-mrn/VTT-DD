'use client';

/**
 * Inspecteur d'un objet, section « Fouille » (MJ ; docs/carte.md § 10) : ouvrir la fouille aux
 * joueurs, sa portée (en unités de jeu, du centre du token au bord de l'objet) et le contenu.
 */
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { deepEqual } from '@/lib/map/store/commands';
import { setSearchable, updateObjects } from '../engine/placement';
import {
  DEFAULT_SEARCH_RADIUS,
  itemsOf,
  MAX_SEARCH_RADIUS,
  type ObjectData,
} from '../engine/types';
import { useMapState } from '@/components/map/engine-context';
import { ContentsEditor } from './contents-editor';
import { CommitNumber, FieldLabel, ToggleRow } from './fields';
import { unitNameOf } from '@/lib/map/store/map-store';

export function SearchInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const entity = entities[0]!;
  const o = entity.data as ObjectData;
  const unit = useMapState((s) => unitNameOf(s.settings));
  const radius = o.searchRadius ?? DEFAULT_SEARCH_RADIUS;

  return (
    <div className="space-y-4">
      <ToggleRow
        label="Les joueurs peuvent fouiller"
        hint="Un joueur dont un personnage est à portée voit « Fouiller » en cliquant l’objet."
        checked={o.searchable === true}
        onChange={(on) => void setSearchable(engine, [entity], on)}
      />
      <div className="space-y-1.5">
        <FieldLabel htmlFor={`search-radius-${entity.id}`}>Portée</FieldLabel>
        <div className="flex items-center gap-2">
          <CommitNumber
            id={`search-radius-${entity.id}`}
            value={radius}
            min={0}
            max={MAX_SEARCH_RADIUS}
            step={0.5}
            suffix={unit}
            className="w-28"
            onCommit={(r) =>
              void updateObjects(engine, 'Portée de fouille', [entity], (x) => ({
                ...x,
                searchRadius: r,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">du centre du token au bord de l’objet</p>
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
