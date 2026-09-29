'use client';

/**
 * Inspecteur d'une pièce (MJ) : nom (affiché au centre, pour le MJ), taille, et « Poser les murs
 * du contour ». Une pièce fermée (aucune porte ouverte sur son contour) coupe la vue entre
 * dedans et dehors (docs/carte.md § 9).
 */
import { BrickWall } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { executePlan, patchRooms } from '@/lib/map/modules/obstacles/commands';
import { addChain } from '@/lib/map/modules/obstacles/edits';
import { signedArea } from '@/lib/map/modules/obstacles/geometry';
import { newPlan } from '@/lib/map/modules/obstacles/kinds';
import { defaultProps, type RoomData } from '@/lib/map/modules/obstacles/model';
import { obstacleContextOf } from '@/lib/map/modules/obstacles/register';

export function RoomInspector({ engine, entities }: InspectorSectionProps) {
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
      'Renommer la pièce',
      ctx.persistences.rooms,
    );
  };
  const kc = engine.kindContext();
  const unit = (kc.settings?.unitName as string | undefined) ?? 'm';
  const area = Math.abs(signedArea(room.points)) / (kc.pixelsPerUnit || 50) ** 2;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] text-foreground">
          Nom
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
        {room.points.length} sommets · {area.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}{' '}
        {unit}²
      </p>
      <p className="text-xs text-muted-foreground">
        Fermée tant qu’aucune porte ouverte n’est sur son contour : de l’intérieur, on ne voit pas
        dehors ; de l’extérieur, on ne voit pas dedans.
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        onClick={() => {
          const plan = newPlan(engine);
          addChain(plan, [...room.points, room.points[0]!], defaultProps('wall'));
          void executePlan(engine, 'Poser les murs', plan, ctx.persistences);
        }}
      >
        <BrickWall />
        Poser les murs du contour
      </Button>
    </div>
  );
}
