'use client';

/**
 * Inspecteur d'une pièce (MJ) : nom (affiché au centre, pour le MJ), taille, et « Poser les murs
 * du contour ». Une pièce fermée (aucune porte ouverte sur son contour) coupe la vue entre
 * dedans et dehors (docs/carte.md § 9).
 */
import { translate } from '@/i18n/runtime';
import { BrickWall } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { executePlan, patchRooms } from '../engine/commands';
import { addChain } from '../engine/edits';
import { signedArea } from '../engine/geometry';
import { newPlan } from '../engine/kinds';
import { defaultProps, type RoomData } from '../engine/model';
import { obstacleContextOf } from '../engine/register';
import { formatAreaOf } from '@/lib/map/engine/distance';

export function RoomInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const ctx = obstacleContextOf(engine);
  const id = useId();
  const room = entities[0]?.data as RoomData | undefined;
  const [name, setName] = useState(room?.name ?? '');
  useEffect(() => setName(room?.name ?? ''), [room?.name]);
  if (!ctx || !room) return null;

  const commit = () => {
    const next = name.trim().slice(0, 200);
    if (next === room.name) return;
    void patchRooms(
      engine,
      entities,
      () => ({ name: next }),
      translate('map.obstacles.renameRoom'),
      ctx.persistences.rooms,
    );
  };
  const kc = engine.kindContext();
  const area = Math.abs(signedArea(room.points)) / (kc.pixelsPerUnit || 50) ** 2;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] text-foreground">
          {translate('map.lights.name')}
        </label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {room.points.length} sommets · {formatAreaOf(area, kc)}
      </p>
      <p className="text-xs text-muted-foreground">{translate('map.obstacles.roomHint')}</p>
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={() => {
          const plan = newPlan(engine);
          addChain(plan, [...room.points, room.points[0]!], defaultProps('wall'));
          void executePlan(engine, translate('map.obstacles.placeWalls'), plan, ctx.persistences);
        }}
      >
        <BrickWall />
        {translate('map.obstacles.placeOutlineWalls')}
      </Button>
    </div>
  );
}
