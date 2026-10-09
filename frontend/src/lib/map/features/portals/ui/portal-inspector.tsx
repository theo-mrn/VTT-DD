'use client';

/**
 * Inspecteur des portails (MJ) : nom, icône, couleur, zone, visible des joueurs, automatique ;
 * destination (sur cette scène : choisir l'arrivée sur la carte ; ou une autre scène et son
 * arrivée) ; retour relié (sélectionner, délier) ou « Poser le retour ». Chaque réglage est une
 * commande annulable ; une sélection multiple règle l'apparence et le comportement.
 */
import { translate } from '@/i18n/runtime';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, Crosshair, Link2Off, MapPinned } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Segmented } from '@/components/audio/parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { mapKeys, mapsApi } from '@/lib/map/api';
import type { InspectorSectionProps } from '@/lib/map/engine/map-engine';
import { patchPortals } from '../engine/kind';
import {
  hasDestination,
  iconLabel,
  PORTAL_ICONS,
  portalColorOptions,
  PORTALS_TOOL_ID,
  portalLabel,
  RADIUS_RANGE,
  type PortalData,
} from '../engine/model';
import { portalModuleOf } from '../engine/register';
import { PortalTool } from '../engine/tool';
import { useMapState } from '@/components/map/engine-context';
import {
  FieldRow,
  OptionButton,
  RangeField,
  Swatches,
} from '@/lib/map/features/obstacles/ui/controls';
import { PortalGlyph } from './portal-glyph';
import { SceneDestination } from './scene-destination';
import { formatDistance } from '@/lib/map/engine/distance';

export function PortalInspector({ engine, entities }: Readonly<InspectorSectionProps>) {
  const ctx = portalModuleOf(engine);
  const id = useId();
  const first = entities[0]?.data as PortalData | undefined;
  const [name, setName] = useState(first?.name ?? '');
  useEffect(() => setName(first?.name ?? ''), [first?.name]);
  // Le retour relié peut changer sans que ce portail change
  const portals = useMapState((s) => s.collections.portals);
  const { campaignId, mapId } = engine.store.getState();
  const maps = useQuery({
    queryKey: mapKeys.list(campaignId),
    queryFn: () => mapsApi.list(campaignId),
  });
  if (!ctx || !first) return null;

  const list = entities.map((e) => e.data as PortalData);
  const single = entities.length === 1;
  const same = <T,>(pick: (p: PortalData) => T): T | null =>
    list.every((p) => pick(p) === pick(first)) ? pick(first) : null;
  const patch = (label: string, fn: (p: PortalData) => Partial<PortalData>) =>
    void patchPortals(ctx, entities, fn, label);
  const ppu = engine.kindContext().pixelsPerUnit || 50;
  const distance = engine.kindContext();

  const commitName = () => {
    const next = name.trim().slice(0, 200);
    if (next !== first.name) patch(translate('map.portals.rename'), () => ({ name: next }));
  };

  return (
    <div className="space-y-4">
      {single && (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="text-[13px] text-foreground">
            {translate('map.lights.name')}
          </label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={200}
            placeholder={portalLabel({ name: '', icon: first.icon })}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitName();
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">{translate('map.portals.nameHint')}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-[13px] text-foreground">{translate('map.portals.icon')}</span>
        <div className="flex gap-1">
          {PORTAL_ICONS.map((i) => (
            <OptionButton
              key={i}
              label={iconLabel(i)}
              active={same((p) => p.icon) === i}
              onClick={() => patch(translate('map.portals.portalIcon'), () => ({ icon: i }))}
            >
              <PortalGlyph icon={i} />
            </OptionButton>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[13px] text-foreground">{translate('map.lights.color')}</span>
        <Swatches
          value={same((p) => p.color) ?? ''}
          options={portalColorOptions()}
          onChange={(c) => c && patch(translate('map.portals.portalColor'), () => ({ color: c }))}
        />
      </div>

      <RangeField
        label="Zone (rayon)"
        value={Math.round(((same((p) => p.radius) ?? first.radius) / ppu) * 100) / 100}
        min={RADIUS_RANGE.min}
        max={RADIUS_RANGE.max}
        step={RADIUS_RANGE.step}
        format={(v) => formatDistance(v, distance)}

        scale={distance.unitsPerCell}
        onCommit={(v) =>
          patch(translate('map.portals.portalZone'), () => ({
            radius: Math.round(v * ppu * 100) / 100,
          }))
        }
      />

      <FieldRow
        label={translate('map.portals.visibleToPlayers')}
        htmlFor={`${id}-visible`}
        hint={translate('map.portals.hiddenHint')}
      >
        <Switch
          id={`${id}-visible`}
          checked={list.every((p) => p.visible)}
          onCheckedChange={(on) =>
            patch(on ? translate('map.portals.show') : translate('map.portals.hide'), () => ({
              visible: on,
            }))
          }
        />
      </FieldRow>

      <FieldRow
        label={translate('map.portals.auto')}
        htmlFor={`${id}-auto`}
        hint={translate('map.portals.autoCrossed')}
      >
        <Switch
          id={`${id}-auto`}
          checked={list.every((p) => p.auto)}
          onCheckedChange={(on) =>
            patch(
              on ? translate('map.portals.setAuto') : translate('map.portals.setOnDemand'),
              () => ({ auto: on }),
            )
          }
        />
      </FieldRow>

      {single && (
        <Destination
          engine={engine}
          portal={first}
          scenes={maps.data ?? []}
          mapId={mapId}
          portals={portals}
          patch={(label, fn) => patch(label, fn)}
          placeReturn={() => ctx.placeReturn(first)}
        />
      )}
    </div>
  );
}

function Destination({
  engine,
  portal,
  scenes,
  mapId,
  portals,
  patch,
  placeReturn,
}: Readonly<{
  engine: InspectorSectionProps['engine'];
  portal: PortalData;
  scenes: Parameters<typeof SceneDestination>[0]['scenes'];
  mapId: string;
  portals: ReadonlyMap<string, unknown> | undefined;
  patch(label: string, fn: (p: PortalData) => Partial<PortalData>): void;
  placeReturn(): void;
}>) {
  const [mode, setMode] = useState<'here' | 'scene'>(
    portal.kind === 'scene_change' ? 'scene' : 'here',
  );
  useEffect(() => setMode(portal.kind === 'scene_change' ? 'scene' : 'here'), [portal.kind]);
  const twin = portal.linkedPortalId
    ? (portals?.get(portal.linkedPortalId) as PortalData | undefined)
    : undefined;
  const sceneName = scenes.find((s) => s.id === portal.targetMapId)?.name;

  const pick = () => {
    engine.tools.activate(PORTALS_TOOL_ID);
    const tool = engine.tools.active;
    if (tool instanceof PortalTool) tool.startPick(engine, portal.id);
  };

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-subtle">
        {translate('map.portals.destination')}
      </span>
      <Segmented
        label={translate('map.portals.destination')}
        value={mode}
        onChange={(v) => setMode(v as 'here' | 'scene')}
        options={[
          { value: 'here', label: translate('map.portals.thisScene'), icon: Crosshair },
          { value: 'scene', label: translate('map.portals.otherScene'), icon: MapPinned },
        ]}
      />
      {mode === 'here' ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {arrivalHint(
              portal.kind === 'same_map' && Boolean(portal.target),
              Boolean(portal.linkedPortalId),
            )}
          </p>
          <Button variant="secondary" size="sm" onClick={pick}>
            <Crosshair />
            {translate('map.portals.pickArrival')}
          </Button>
        </div>
      ) : (
        <SceneDestination
          scenes={scenes}
          currentMapId={mapId}
          value={{
            mapId: portal.kind === 'scene_change' ? portal.targetMapId : null,
            target: portal.kind === 'scene_change' ? portal.target : null,
          }}
          onChange={(v) =>
            v.mapId &&
            patch(translate('map.portals.portalDestination'), () => ({
              kind: 'scene_change',
              targetMapId: v.mapId,
              target: v.target,
            }))
          }
        />
      )}

      <div className="space-y-2 rounded-xl border border-border p-3">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <ArrowRightLeft className="size-4 text-primary" aria-hidden />
          {translate('map.portals.return')}
        </span>
        {portal.linkedPortalId ? (
          <>
            <p className="text-xs text-muted-foreground">
              {twin
                ? translate('map.portals.linkedHere', { name: portalLabel(twin) })
                : translate('map.portals.linkedElsewhere', {
                    scene: sceneName ?? translate('map.portals.anotherScene'),
                  })}{' '}
              {translate('map.portals.linkedMoves')}
            </p>
            <div className="flex flex-wrap gap-2">
              {twin && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => engine.selection.replace([twin.id])}
                >
                  {translate('map.portals.selectReturn')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  patch(translate('map.portals.unlinkReturn'), () => ({ linkedPortalId: null }))
                }
              >
                <Link2Off />
                {translate('map.portals.unlink')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{translate('map.portals.oneWayHint')}</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasDestination(portal)}
              onClick={placeReturn}
            >
              {translate('map.portals.placeReturn')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function arrivalHint(hasArrival: boolean, linked: boolean): string {
  if (!hasArrival) return translate('map.portals.noArrival');
  return linked ? translate('map.portals.arriveAtReturn') : translate('map.portals.arriveAtMarker');
}
