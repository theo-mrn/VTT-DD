'use client';

/**
 * Inspecteur des portails (MJ) : nom, icône, couleur, zone, visible des joueurs, automatique ;
 * destination (sur cette scène : choisir l'arrivée sur la carte ; ou une autre scène et son
 * arrivée) ; retour relié (sélectionner, délier) ou « Poser le retour ». Chaque réglage est une
 * commande annulable ; une sélection multiple règle l'apparence et le comportement.
 */
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
  PORTAL_COLORS,
  PORTAL_ICONS,
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
  const unit = engine.kindContext().unitName;

  const commitName = () => {
    const next = name.trim().slice(0, 200);
    if (next !== first.name) patch('Renommer le portail', () => ({ name: next }));
  };

  return (
    <div className="space-y-4">
      {single && (
        <div className="space-y-1.5">
          <label htmlFor={`${id}-name`} className="text-[13px] text-foreground">
            Nom
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
          <p className="text-xs text-muted-foreground">
            Montré aux joueurs : évitez d’y nommer une scène qu’ils ne connaissent pas encore.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-[13px] text-foreground">Icône</span>
        <div className="flex gap-1">
          {PORTAL_ICONS.map((i) => (
            <OptionButton
              key={i.value}
              label={i.label}
              active={same((p) => p.icon) === i.value}
              onClick={() => patch('Icône du portail', () => ({ icon: i.value }))}
            >
              <PortalGlyph icon={i.value} />
            </OptionButton>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[13px] text-foreground">Couleur</span>
        <Swatches
          value={same((p) => p.color) ?? ''}
          options={PORTAL_COLORS}
          onChange={(c) => c && patch('Couleur du portail', () => ({ color: c }))}
        />
      </div>

      <RangeField
        label="Zone (rayon)"
        value={Math.round(((same((p) => p.radius) ?? first.radius) / ppu) * 100) / 100}
        min={RADIUS_RANGE.min}
        max={RADIUS_RANGE.max}
        step={RADIUS_RANGE.step}
        format={(v) => `${v.toLocaleString('fr-FR')} ${unit}`}
        onCommit={(v) =>
          patch('Zone du portail', () => ({ radius: Math.round(v * ppu * 100) / 100 }))
        }
      />

      <FieldRow
        label="Visible des joueurs"
        htmlFor={`${id}-visible`}
        hint="Masqué, les joueurs ne le voient ni ne l’empruntent."
      >
        <Switch
          id={`${id}-visible`}
          checked={list.every((p) => p.visible)}
          onCheckedChange={(on) =>
            patch(on ? 'Montrer le portail' : 'Masquer le portail', () => ({ visible: on }))
          }
        />
      </FieldRow>

      <FieldRow
        label="Automatique"
        htmlFor={`${id}-auto`}
        hint="Franchi dès qu’un joueur y lâche son token, sans question."
      >
        <Switch
          id={`${id}-auto`}
          checked={list.every((p) => p.auto)}
          onCheckedChange={(on) =>
            patch(on ? 'Portail automatique' : 'Portail sur demande', () => ({ auto: on }))
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
      <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Destination</span>
      <Segmented
        label="Destination"
        value={mode}
        onChange={(v) => setMode(v as 'here' | 'scene')}
        options={[
          { value: 'here', label: 'Cette scène', icon: Crosshair },
          { value: 'scene', label: 'Autre scène', icon: MapPinned },
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
            Choisir l’arrivée sur la carte
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
            patch('Destination du portail', () => ({
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
          Retour
        </span>
        {portal.linkedPortalId ? (
          <>
            <p className="text-xs text-muted-foreground">
              {twin
                ? `Relié à « ${portalLabel(twin)} », sur cette scène.`
                : `Relié à un portail de « ${sceneName ?? 'une autre scène'} ».`}{' '}
              Déplacer l’un déplace l’arrivée de l’autre.
            </p>
            <div className="flex flex-wrap gap-2">
              {twin && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => engine.selection.replace([twin.id])}
                >
                  Sélectionner le retour
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch('Délier le retour', () => ({ linkedPortalId: null }))}
              >
                <Link2Off />
                Délier
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Aller simple. Le retour se pose à l’arrivée, relié à ce portail.
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={!hasDestination(portal)}
              onClick={placeReturn}
            >
              Poser le retour
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function arrivalHint(hasArrival: boolean, linked: boolean): string {
  if (!hasArrival) return 'Pas encore d’arrivée sur cette scène.';
  return linked
    ? 'Les tokens arrivent à son retour, sur cette scène.'
    : 'Les tokens arrivent au repère d’arrivée (glissez-le avec l’outil Portails).';
}
