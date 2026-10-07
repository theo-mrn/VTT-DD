'use client';

/**
 * Présence du module « portails » à la table (surcouche sans emplacement, `registerOverlay`) :
 *
 * - les scènes de la campagne, données au module (menus, retour sur une autre scène) ;
 * - joueur : la proposition « Emprunter : <nom> » au-dessus du portail où il vient de lâcher son
 *   token (×, Échap, ou sortir de la zone : elle disparaît) ; après un passage vers une autre
 *   scène, la vue suit sans attendre ;
 * - MJ : un toast quand un joueur emprunte un portail (`map_portal.used`), et, quand il fait
 *   passer quelqu'un sur une autre scène, « Y aller ».
 */
import { formatter, translate } from '@/i18n/runtime';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MapPortalUsedPayload } from '@vtt/contracts';
import { LogIn, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { mapKeys, mapsApi } from '@/lib/map/api';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { portalLabel, type SceneRef } from '../engine/model';
import { portalModuleOf, type PortalModule } from '../engine/register';
import { PORTAL_ICON_PX } from '../engine/view';
import { useCampaignEvents } from '@/lib/realtime';
import { openScene } from '@/components/map/use-table-map';
import { trackOverlay, type OverlaySizes } from '@/components/map/overlay-tracker';
import { PortalGlyph } from './portal-glyph';

export function PortalsHost({ engine }: Readonly<{ engine: MapEngine }>) {
  const ctx = portalModuleOf(engine);
  if (!ctx) return null;
  const role = engine.viewer.role;
  return (
    <>
      <ScenesFeed ctx={ctx} />
      <Crossings ctx={ctx} />
      {role === 'gm' && <GmNotices ctx={ctx} />}
      {role === 'player' && <Prompt ctx={ctx} />}
    </>
  );
}

/** Scènes de la campagne → module (retour sur une autre scène, noms dans les menus). */
function ScenesFeed({ ctx }: { ctx: PortalModule }) {
  const campaignId = ctx.engine.store.getState().campaignId;
  const maps = useQuery({
    queryKey: mapKeys.list(campaignId),
    queryFn: () => mapsApi.list(campaignId),
  });
  useEffect(() => {
    const scenes: SceneRef[] = (maps.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      visibleToPlayers: m.visibleToPlayers,
      groupId: m.groupId,
      spawn: m.spawn,
      width: m.width,
      height: m.height,
      backgroundUrl: m.backgroundUrl,
    }));
    ctx.scenesStore.setState({ scenes });
  }, [ctx, maps.data]);
  return null;
}

/** Passage vers une autre scène : la vue suit (joueur) ; « Y aller » (MJ). */
function Crossings({ ctx }: { ctx: PortalModule }) {
  const qc = useQueryClient();
  const campaignId = ctx.engine.store.getState().campaignId;
  useEffect(
    () =>
      ctx.travel.onCrossed((result, portal, party) => {
        // Une scène cachée apparaît dans la liste de ceux qui y arrivent
        void qc.invalidateQueries({ queryKey: mapKeys.list(campaignId) });
        void qc.invalidateQueries({ queryKey: [...mapKeys.scope(campaignId), 'where'] });
        if (ctx.engine.viewer.role !== 'gm') return;
        const scene = ctx.scenes().find((s) => s.id === result.mapId)?.name;
        let who = characterName(ctx, result.items[0]?.characterId);
        if (party) who = translate('map.portals.theParty');
        else if (result.items.length > 1)
          who = translate('map.portals.characters', { count: result.items.length });
        const name = portalLabel(portal);
        toast(
          scene
            ? translate('map.portals.crossedTo', { who, name, scene })
            : translate('map.portals.crossed', { who, name }),
          {
            action: {
              label: translate('map.portals.goThere'),
              onClick: () => openScene(result.mapId),
            },
          },
        );
      }),
    [ctx, qc, campaignId],
  );
  return null;
}

const characterName = (ctx: PortalModule, id: string | undefined) =>
  ctx.engine.directory.characters().find((c) => c.id === id)?.name ??
  translate('map.portals.aCharacter');

/** Toast du MJ : un joueur a emprunté un portail. */
function GmNotices({ ctx }: { ctx: PortalModule }) {
  const { engine } = ctx;
  const campaignId = engine.store.getState().campaignId;
  useCampaignEvents(campaignId, ['map_portal.used'], (e) => {
    if (e.redacted) return;
    const p = e.event.payload as unknown as MapPortalUsedPayload;
    if (p.userId === engine.viewer.userId) return;
    const names = p.characterIds.map((id) => characterName(ctx, id));
    const who =
      names.length > 2
        ? translate('map.portals.someAndOthers', {
            names: names.slice(0, 2).join(', '),
            count: names.length - 2,
          })
        : formatter().list(names, 'and');
    const scene = p.toMapId !== p.mapId ? ctx.scenes().find((s) => s.id === p.toMapId)?.name : null;
    toast(
      translate('map.portals.used', {
        who,
        count: names.length,
        name: p.name || translate('map.portals.aPortal'),
      }),
      {
        description: scene ? translate('map.portals.toScene', { scene }) : undefined,
        action:
          p.toMapId !== p.mapId
            ? { label: translate('map.portals.goThere'), onClick: () => openScene(p.toMapId) }
            : undefined,
      },
    );
  });
  return null;
}

/** Proposition au joueur, au-dessus du portail : « Emprunter : <nom> ». */
function Prompt({ ctx }: Readonly<{ ctx: PortalModule }>) {
  const { engine, travel } = ctx;
  const prompt = useStore(travel.state, (s) => s.prompt);
  const busy = useStore(travel.state, (s) => s.busy);
  const ref = useRef<HTMLDivElement>(null);
  const portal = prompt ? travel.portal(prompt.portalId) : undefined;
  const shown = !!portal;

  // Au-dessus de l'icône du portail, suivie sans re-rendre React ni lire la mise en page à
  // chaque image (`trackOverlay`)
  useEffect(() => {
    if (!prompt) return;
    // Échap ferme la proposition (la carte garde ses autres usages d'Échap)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') travel.dismiss();
    };
    window.addEventListener('keydown', onKey);
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return () => window.removeEventListener('keydown', onKey);
    let last = '';
    const place = ({ w, h, hostW, hostH }: OverlaySizes) => {
      const p = travel.portal(prompt.portalId);
      if (!p) return;
      const at = engine.camera.worldToScreen(p.pos);
      const x = Math.round(Math.min(Math.max(at.x - w / 2, 8), hostW - w - 8));
      let y = at.y - PORTAL_ICON_PX - 14 - h;
      if (y < 64) y = at.y + PORTAL_ICON_PX + 28;
      y = Math.round(Math.min(Math.max(y, 8), hostH - h - 8));
      const key = `${x}:${y}`;
      if (key === last) return;
      last = key;
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.visibility = 'visible';
    };
    const stop = trackOverlay(engine, el, host, place);
    return () => {
      stop();
      window.removeEventListener('keydown', onKey);
    };
    // `shown` : la proposition est rendue (son portail est connu)
  }, [engine, travel, prompt, shown]);

  if (!prompt || !portal) return null;
  const name = portalLabel(portal);
  const going = busy === portal.id;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={translate('map.portals.takeNamed', { name })}
      className="pointer-events-auto absolute left-0 top-0 z-20 flex items-center gap-2 rounded-xl border border-border bg-background py-1 pl-1.5 pr-1 shadow-elevated"
      style={{ visibility: 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-background text-white shadow-surface"
        style={{ backgroundColor: portal.color ?? undefined }}
        aria-hidden
      >
        <PortalGlyph icon={portal.icon} className="size-3.5" />
      </span>
      <Button
        size="sm"
        className="h-8"
        loading={going}
        onClick={() => void travel.use(portal, { characterIds: prompt.characterIds })}
      >
        <LogIn />
        {translate('map.portals.takeColon', { name })}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={translate('map.portals.stayHere')}
        onClick={() => travel.dismiss()}
      >
        <X />
      </Button>
    </div>
  );
}
