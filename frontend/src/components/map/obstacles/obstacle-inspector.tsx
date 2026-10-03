'use client';

/**
 * Inspecteur des obstacles (MJ) : type, porte ouverte et verrouillée, sens d'un mur à sens
 * unique, couleur et transparence. S'applique à toute la sélection ; chaque réglage est une
 * commande annulable.
 */
import {
  AppWindow,
  ArrowLeftRight,
  ArrowRightToLine,
  BrickWall,
  DoorOpen,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { InspectorSectionProps, MapEngine } from '@/lib/map/engine/map-engine';
import { patchObstacles } from '@/lib/map/modules/obstacles/commands';
import { convertedProps } from '@/lib/map/modules/obstacles/edits';
import { polylineSegments } from '@/lib/map/modules/obstacles/geometry';
import {
  OBSTACLE_LABELS,
  WALL_COLORS,
  type ObstacleData,
  type ObstacleKindId,
} from '@/lib/map/modules/obstacles/model';
import { obstacleContextOf } from '@/lib/map/modules/obstacles/register';
import { formatLength } from '@/lib/map/modules/obstacles/tool';
import { cn } from '@/lib/utils';
import { FieldRow, RangeField, Swatches } from './controls';

const KINDS: readonly { id: ObstacleKindId; icon: LucideIcon }[] = [
  { id: 'wall', icon: BrickWall },
  { id: 'door', icon: DoorOpen },
  { id: 'window', icon: AppWindow },
  { id: 'one_way_wall', icon: ArrowRightToLine },
];

/** Valeur commune à toute la sélection, sinon `mixed`. */
function common<T>(items: readonly ObstacleData[], pick: (o: ObstacleData) => T): T | 'mixed' {
  const first = pick(items[0]!);
  return items.every((o) => pick(o) === first) ? first : 'mixed';
}

export function ObstacleInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const ctx = obstacleContextOf(engine);
  const id = useId();
  if (!ctx || !entities.length) return null;
  const data = entities.map((e) => e.data as ObstacleData);
  const kind = common(data, (o) => o.kind);
  const doors = data.every((o) => o.kind === 'door');
  const oneWay = data.every((o) => o.kind === 'one_way_wall');
  const color = common(data, (o) => o.color);
  const opacity = common(data, (o) => o.opacity);
  const patch = (label: string, fn: (o: ObstacleData) => Partial<ObstacleData>) =>
    void patchObstacles(engine, entities, fn, label, ctx.persistences.obstacles);

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Type" className="grid grid-cols-4 gap-1">
        {KINDS.map((k) => {
          const selected = kind === k.id;
          return (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() =>
                patch(`Convertir en ${OBSTACLE_LABELS[k.id].toLowerCase()}`, (o) =>
                  convertedProps(o, k.id),
                )
              }
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border border-border px-1 py-2 text-[11px] text-muted-foreground transition-colors',
                'hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                selected && 'border-primary/50 bg-primary/10 text-foreground',
              )}
            >
              <k.icon className="size-4" aria-hidden />
              <span className="leading-tight">
                {OBSTACLE_LABELS[k.id].replace('Mur à sens unique', 'Sens unique')}
              </span>
            </button>
          );
        })}
      </div>

      {doors && (
        <div className="space-y-1">
          <FieldRow label="Ouverte" htmlFor={`${id}-open`}>
            <Switch
              id={`${id}-open`}
              checked={data.every((o) => o.isOpen)}
              onCheckedChange={(on) =>
                patch(on ? 'Ouvrir la porte' : 'Fermer la porte', () => ({ isOpen: on }))
              }
            />
          </FieldRow>
          <FieldRow
            label="Verrouillée"
            htmlFor={`${id}-locked`}
            hint="Un joueur ne peut pas ouvrir une porte verrouillée."
          >
            <Switch
              id={`${id}-locked`}
              checked={data.every((o) => o.isLocked)}
              onCheckedChange={(on) =>
                patch(on ? 'Verrouiller la porte' : 'Déverrouiller la porte', () => ({
                  isLocked: on,
                }))
              }
            />
          </FieldRow>
        </div>
      )}

      {oneWay && (
        <FieldRow
          label="Sens"
          hint="La flèche montre le sens où l’on voit : de l’autre côté, le mur bloque la vue."
        >
          <Button
            variant="secondary"
            size="xs"
            onClick={() =>
              patch('Inverser le sens', (o) => ({
                blocksFrom: (o.blocksFrom ?? 'left') === 'left' ? 'right' : 'left',
              }))
            }
          >
            <ArrowLeftRight />
            Inverser le sens
          </Button>
        </FieldRow>
      )}

      <div className="space-y-2">
        <span className="text-[13px] text-foreground">Couleur</span>
        <Swatches
          value={color === 'mixed' ? '' : color}
          options={WALL_COLORS}
          allowDefault
          onChange={(c) => patch('Couleur', () => ({ color: c }))}
        />
      </div>

      <RangeField
        label="Opacité"
        value={Math.round((opacity === 'mixed' ? 1 : opacity) * 100)}
        min={0}
        max={100}
        step={5}
        format={(v) => (v >= 100 ? '100 % (bloque la vue)' : `${v} % (ombre partielle)`)}
        onCommit={(v) => patch('Transparence', () => ({ opacity: v / 100 }))}
      />

      <Summary engine={engine} entities={entities} />
    </div>
  );
}

/** Nombre de segments et longueur totale. */
function Summary({
  engine,
  entities,
}: Readonly<{ engine: MapEngine; entities: readonly MapEntity[] }>) {
  let segments = 0;
  let length = 0;
  for (const e of entities)
    for (const [a, b] of polylineSegments((e.data as ObstacleData).points)) {
      segments += 1;
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
  const kc = engine.kindContext();
  const unit = kc.unitName;
  return (
    <p className="text-xs text-muted-foreground">
      {segments} segment{segments > 1 ? 's' : ''} · {formatLength(length, kc.pixelsPerUnit, unit)}
    </p>
  );
}
