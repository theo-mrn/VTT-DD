'use client';

/**
 * Carte d'une scène (docs/carte.md § 2 à § 8) : monte le moteur (`lib/map/engine`) dans la scène
 * de la table, et ses surcouches React (barre d'outils, menu contextuel, inspecteur, calques,
 * confirmations). Chargé côté client seulement (`next/dynamic`, `ssr: false`) : PixiJS et le
 * moteur partent dans leur propre morceau de code.
 *
 * Un moteur par carte : changer de scène démonte tout (aucun contexte WebGL ne reste, HMR
 * compris) et remonte une carte neuve. La pile d'annulation, elle, est gardée par utilisateur
 * et par carte le temps de la session.
 */
import { AlertTriangle, MapPinOff, RotateCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { EtatVide } from '@/components/commun/page';
import { Button } from '@/components/ui/button';
import { setActiveMap } from '@/lib/map/active-map';
import { createMapApi, type MapApiClient } from '@/lib/map/api';
import type { MapViewer } from '@/lib/map/engine/entities/entity-kind';
import { bindDomInput } from '@/lib/map/engine/interaction/dom-input';
import { MapEngine, type MapDirectory, type MapPlayer } from '@/lib/map/engine/map-engine';
import { LIVE_KIND, LiveChannel, PING_KIND } from '@/lib/map/live/live-channel';
import { MAP_MODULES } from '@/lib/map/modules';
import { CommandManager, historyFor } from '@/lib/map/store/commands';
import { createMapStore, type MapStore } from '@/lib/map/store/map-store';
import { useMapSync, type MapSync } from '@/lib/map/store/sync';
import { useCampaignEphemeral } from '@/lib/realtime';
import { MapConfirmDialog } from './confirm-dialog';
import { MapContextMenu } from './context-menu';
import { EntityPicker } from './entity-picker';
import { MapEngineProvider } from './engine-context';
import { MapInspector } from './inspector';
import { LayersPanel } from './layers/layers-panel';
import { MapBubbles } from './bubbles/map-bubbles';
import { MapOverlays } from './overlays';
import { PartyBarHost } from './party/party-bar';
import { MapSounds } from './sounds/map-sounds';
import { SelectionPanel } from './selection-panel';
import { MapToolbar } from './toolbar/toolbar';

export interface MapCanvasProps {
  campaignId: string;
  mapId: string;
  viewer: MapViewer;
  /** Personnages des joueurs (« Visible pour… »). */
  characters: readonly { id: string; name: string }[];
  /** Noms des membres (curseurs, pings). */
  members: readonly { userId: string; name: string | null }[];
  /** Joueurs et spectateurs, et leurs personnages (vision : vue de chacun, audience du direct). */
  players?: readonly MapPlayer[];
}

interface Runtime {
  store: MapStore;
  api: MapApiClient;
  commands: CommandManager;
  live: LiveChannel;
  engine: MapEngine;
  sync: { current: MapSync | null };
}

export default function MapCanvas(props: Readonly<MapCanvasProps>) {
  const { campaignId, mapId, viewer } = props;
  const [runtime, setRuntime] = useState<Runtime | null>(null);

  // Annuaire lu à la demande par le moteur : toujours les dernières données de la table
  const directoryData = useRef(props);
  directoryData.current = props;
  const viewerRef = useRef(viewer);
  viewerRef.current = viewer;

  useEffect(() => {
    const store = createMapStore(campaignId, mapId);
    const api = createMapApi(campaignId, mapId);
    const sync: Runtime['sync'] = { current: null };
    const commands = new CommandManager({
      store,
      history: historyFor(viewerRef.current.userId, mapId),
      notify: (message) => toast.error(message),
      refetch: async (refs) => {
        const keys = [...new Set(refs.map((r) => r.collection))].filter((k) => k !== 'scene');
        await sync.current?.refetchNow(keys);
      },
    });
    const directory: MapDirectory = {
      characters: () => directoryData.current.characters,
      userName: (userId) =>
        directoryData.current.members.find((m) => m.userId === userId)?.name ?? null,
      players: () => directoryData.current.players ?? [],
    };
    const engineRef: { current: MapEngine | null } = { current: null };
    const live = new LiveChannel({
      mapId,
      selfId: viewerRef.current.userId,
      transport: null,
      audienceOf: (id) => engineRef.current?.liveAudience(id) ?? 'gm',
    });
    const engine = new MapEngine({
      store,
      viewer: viewerRef.current,
      commands,
      backend: api,
      live,
      directory,
      notify: (message) => toast(message),
    });
    engineRef.current = engine;
    for (const module of MAP_MODULES) engine.use(module);
    const release = setActiveMap(campaignId, mapId, engine);
    setRuntime({ store, api, commands, live, engine, sync });
    return () => {
      release();
      setRuntime(null);
      engine.destroy();
      live.destroy();
    };
  }, [campaignId, mapId]);

  // Droits relus quand le rôle ou les personnages changent (sans remonter la carte)
  const characterKey = viewer.characterIds.join(',');
  useEffect(() => {
    if (!runtime) return;
    const current = runtime.engine.viewer;
    if (
      current.userId !== viewer.userId ||
      current.role !== viewer.role ||
      current.characterIds.join(',') !== characterKey
    )
      runtime.engine.setViewer(viewer);
  }, [runtime, viewer, characterKey]);

  // Annuaire arrivé ou changé (personnages, joueurs, membres) : le moteur le lit à l'image, il en
  // faut une tout de suite (vision du joueur, noms), sans attendre un geste
  const { characters, players, members } = props;
  useEffect(() => {
    runtime?.engine.invalidate();
  }, [runtime, characters, players, members]);

  if (!runtime) return null;
  return (
    <MapEngineProvider value={runtime.engine}>
      <MapRuntime runtime={runtime} campaignId={campaignId} viewer={viewer} />
    </MapEngineProvider>
  );
}

function MapRuntime({
  runtime,
  campaignId,
  viewer,
}: Readonly<{
  runtime: Runtime;
  campaignId: string;
  viewer: MapViewer;
}>) {
  const { engine, store, api, live } = runtime;
  const hostRef = useRef<HTMLDivElement>(null);

  // Chargement, événements du bus, relectures
  const syncViewer = useMemo(
    () => ({ role: viewer.role, characterIds: viewer.characterIds }),
    [viewer.role, viewer.characterIds],
  );
  const { sync } = useMapSync({ campaignId, store, reader: api, viewer: syncViewer });
  useEffect(() => {
    runtime.sync.current = sync;
  }, [runtime, sync]);

  // Direct : messages des autres, et transport de mes messages
  const { send } = useCampaignEphemeral(campaignId, [LIVE_KIND, PING_KIND], (m) => live.receive(m));
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    live.setTransport({ send: (kind, data, options) => sendRef.current(kind, data, options) });
    return () => live.setTransport(null);
  }, [live]);

  // Rendu, gestes, taille
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const unbind = bindDomInput(engine, host);
    const resize = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) engine.resize(box.width, box.height);
    });
    resize.observe(host);
    engine.resize(host.clientWidth, host.clientHeight);
    void engine.mount(host);
    return () => {
      resize.disconnect();
      unbind();
    };
  }, [engine]);

  const status = useStore(store, (s) => s.status);
  const failure = useStore(engine.ui, (s) => s.failure);
  const mounted = useStore(engine.ui, (s) => s.mounted);

  return (
    <div className="absolute inset-0">
      <div
        ref={hostRef}
        tabIndex={0}
        role="application"
        aria-roledescription="carte"
        aria-label="Carte de la scène"
        aria-keyshortcuts="V K Escape Delete Control+Z"
        className="absolute inset-0 touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      />

      {(status === 'loading' || (!mounted && !failure)) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-sm text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
            Chargement de la scène…
          </p>
        </div>
      )}

      {(failure || status === 'error' || status === 'gone') && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <EtatVide
            icone={status === 'gone' ? MapPinOff : AlertTriangle}
            titre={titreEchec(Boolean(failure), status === 'gone')}
            description={
              failure ??
              (status === 'gone'
                ? 'Elle a été supprimée, ou le MJ l’a cachée.'
                : 'Le service de la carte ne répond pas.')
            }
            className="w-full max-w-md bg-background/95"
            action={
              status === 'error' ? (
                <Button variant="secondary" onClick={() => void sync.load()}>
                  <RotateCw />
                  Réessayer
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {status === 'ready' && !failure && (
        <>
          <MapToolbar />
          <MapOverlays />
          <MapBubbles campaignId={campaignId} hostRef={hostRef} />
          <MapSounds campaignId={campaignId} hostRef={hostRef} />
          <PartyBarHost />
          <div className="pointer-events-none absolute bottom-24 right-3 top-20 z-10 flex items-start justify-end gap-3">
            <MapInspector />
            <SelectionPanel />
            <LayersPanel />
          </div>
        </>
      )}
      <MapContextMenu hostRef={hostRef} />
      <EntityPicker hostRef={hostRef} />
      <MapConfirmDialog />
    </div>
  );
}

function titreEchec(failure: boolean, gone: boolean): string {
  if (failure) return 'La carte ne peut pas s’afficher';
  return gone ? 'Cette scène n’est plus disponible' : 'La scène n’a pas pu être chargée';
}
