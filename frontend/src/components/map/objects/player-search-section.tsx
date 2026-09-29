'use client';

/**
 * Inspecteur d'un objet à fouiller, vu par un joueur (docs/carte.md § 10) : qui est à portée,
 * et « Fouiller ».
 */
import { PackageSearch } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { reachOf } from '@/lib/map/modules/objects/object-kind';
import { searchControllerOf } from '@/lib/map/modules/objects/search';
import type { ObjectData } from '@/lib/map/modules/objects/types';
import { useMapState } from '../engine-context';

export function PlayerSearchSection({ engine, entities }: InspectorSectionProps) {
  const entity = entities[0]!;
  const o = entity.data as ObjectData;
  const tokens = useMapState((s) => s.collections.tokens);
  const unit = useMapState((s) => s.settings?.unitName ?? 'cases');
  const reach = useMemo(
    () => reachOf(engine, o),
    // Les tokens changent : la portée aussi
    // (`tokens` est la couche du magasin, stable tant qu'aucun token ne change)
    [engine, o, tokens],
  );
  const inRange = reach.filter((r) => r.inRange);
  const names = inRange.map((r) => nameOf(engine, r.characterId));
  const controller = searchControllerOf(engine);

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        {inRange.length
          ? `À portée : ${names.join(', ')}.`
          : reach.length
            ? `Trop loin : approchez-vous à ${(o.searchRadius ?? 0).toLocaleString('fr-FR')} ${unit} de l’objet.`
            : 'Aucun de vos personnages n’est sur cette carte.'}
      </p>
      <Button
        className="w-full"
        disabled={!inRange.length || !controller}
        onClick={() => controller?.open(entity.id)}
      >
        <PackageSearch />
        Fouiller
      </Button>
    </div>
  );
}

const nameOf = (engine: InspectorSectionProps['engine'], id: string) =>
  engine.directory.characters().find((c) => c.id === id)?.name ?? 'Votre personnage';
