'use client';

/**
 * Panneau « Destination » de l'outil portails (MJ, colonne de gauche) : l'entrée est posée, reste
 * à dire où elle mène. Un clic sur la carte : arrivée sur cette scène ; ou une autre scène de la
 * liste, son arrivée (point d'arrivée des joueurs, ou point choisi sur l'aperçu), puis « Poser
 * le portail ». Aller-retour : le retour est posé à l'arrivée, relié.
 */
import { translate } from '@/i18n/runtime';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, MousePointerClick } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { mapKeys, mapsApi } from '@/lib/map/api';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { PORTALS_TOOL_ID } from '../engine/model';
import { PortalTool } from '../engine/tool';
import { useActiveToolId } from '@/components/map/engine-context';
import { MapPanel } from '@/components/map/map-panel';
import { focusMap } from '@/lib/map/features/obstacles/ui/controls';
import { PortalToolIcon } from './portal-glyph';
import { SceneDestination, type SceneTarget } from './scene-destination';

export function PortalDestinationPanel({ engine }: Readonly<{ engine: MapEngine }>) {
  const active = useActiveToolId() === PORTALS_TOOL_ID;
  const tool = engine.tools.active;
  if (!active || !(tool instanceof PortalTool)) return null;
  return <Panel engine={engine} tool={tool} />;
}

function Panel({ engine, tool }: Readonly<{ engine: MapEngine; tool: PortalTool }>) {
  const state = useStore(tool.ui, (u) => u.state);
  const entry = useStore(tool.ui, (u) => u.entry);
  const twoWay = useStore(tool.settings, (s) => s.twoWay);
  const { campaignId, mapId } = engine.store.getState();
  const maps = useQuery({
    queryKey: mapKeys.list(campaignId),
    queryFn: () => mapsApi.list(campaignId),
  });
  const [target, setTarget] = useState<SceneTarget>({ mapId: null, target: null });
  // Nouvelle entrée : nouveau choix
  useEffect(() => setTarget({ mapId: null, target: null }), [entry]);

  if (state !== 'destination' || !entry) return null;

  const cancel = () => {
    tool.cancel(engine);
    focusMap(engine);
  };

  return (
    <MapPanel
      id="portal-destination"
      label={translate('map.portals.portalDestination')}
      icon={PortalToolIcon}
      title={translate('map.portals.portalDestination')}
      subtitle={translate('map.portals.whereTo')}
      closeLabel={translate('map.portals.cancel')}
      onClose={cancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancel();
        }
      }}
      className="w-80"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {translate('map.portals.onThisScene')}
          </h3>
          <p className="flex items-start gap-2 rounded-xl border border-border bg-surface-2/50 p-3 text-sm text-muted-foreground">
            <MousePointerClick className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {translate('map.portals.clickArrival')}
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            {translate('map.portals.toOtherScene')}
          </h3>
          <SceneDestination
            scenes={maps.data ?? []}
            currentMapId={mapId}
            value={target}
            onChange={setTarget}
          />
        </section>

        <label className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <ArrowRightLeft className="size-4 text-primary" aria-hidden />
              Aller-retour
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {translate('map.portals.returnLinked')}
            </span>
          </span>
          <Switch
            checked={twoWay}
            onCheckedChange={(on) => tool.settings.setState({ twoWay: on })}
            aria-label="Aller-retour"
          />
        </label>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            tool.placeWithoutDestination(engine);
            focusMap(engine);
          }}
        >
          {translate('map.portals.noDestination')}
        </Button>
        <Button
          size="sm"
          disabled={!target.mapId}
          onClick={() => {
            if (!target.mapId) return;
            tool.placeToScene(engine, target.mapId, target.target);
            focusMap(engine);
          }}
        >
          {translate('map.portals.placePortal')}
        </Button>
      </footer>
    </MapPanel>
  );
}
