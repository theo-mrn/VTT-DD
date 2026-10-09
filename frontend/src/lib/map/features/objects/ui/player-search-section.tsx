'use client';

/**
 * Inspecteur d'un objet à fouiller, vu par un joueur (docs/carte.md § 10) : qui est à portée,
 * et « Fouiller ».
 */
import { formatter, translate } from '@/i18n/runtime';
import { PackageSearch } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { reachOf } from '../engine/object-kind';
import { searchControllerOf } from '../engine/search';
import type { ObjectData } from '../engine/types';
import { useMapState } from '@/components/map/engine-context';
import { useDistanceScale } from '@/components/map/use-distance';
import { formatDistance } from '@/lib/map/engine/distance';

export function PlayerSearchSection({ engine, entities }: Readonly<InspectorSectionProps>) {
  const entity = entities[0]!;
  const o = entity.data as ObjectData;
  const tokens = useMapState((s) => s.collections.tokens);
  const scale = useDistanceScale();
  const reach = useMemo(
    () => reachOf(engine, o),
    // Les tokens changent : la portée aussi
    // (`tokens` est la couche du magasin, stable tant qu'aucun token ne change)
    [engine, o, tokens],
  );
  const inRange = reach.filter((r) => r.inRange);
  const names = inRange.map((r) => nameOf(engine, r.characterId));
  const controller = searchControllerOf(engine);
  let reachMessage = translate('map.objects.noCharacterHere');
  if (inRange.length)
    reachMessage = translate('map.objects.inReach', { names: formatter().list(names, 'and') });
  else if (reach.length)
    reachMessage = translate('map.objects.tooFarHint', {
      reach: formatDistance(o.searchRadius ?? 0, scale),
    });

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">{reachMessage}</p>
      <Button
        className="w-full"
        disabled={!inRange.length || !controller}
        onClick={() => controller?.open(entity.id)}
      >
        <PackageSearch />
        {translate('map.objects.searchAction')}
      </Button>
    </div>
  );
}

const nameOf = (engine: InspectorSectionProps['engine'], id: string) =>
  engine.directory.characters().find((c) => c.id === id)?.name ??
  translate('map.objects.yourCharacter');
