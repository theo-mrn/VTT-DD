'use client';

/**
 * Échelle d'un nouveau fond (MJ, docs/carte.md § 4) : sans grille de jeu, la case est une part
 * de la largeur du fond (repli, `scenePixelsPerUnit`). Ici, une fois par fond :
 * - le quadrillage dessiné dans l'image est cherché (`detectGrid`) ; trouvé, il devient la
 *   grille de jeu, cachée aux joueurs (l'image a déjà ses lignes), en une commande annulable ;
 * - sinon un bandeau propose de calibrer (glisser sur une case de l'image) ou de laisser le repli.
 */
import { translate } from '@/i18n/runtime';
import type { MapGrid } from '@vtt/contracts';
import { playGridOf, scenePixelsPerUnit } from '@vtt/contracts';
import { Ruler, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isVideoUrl, videoVariant } from '@/lib/map/engine/background-prefs';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { detectGrid } from '../engine/detect';
import { GRID_CALIBRATE_TOOL_ID, newGrid, withGrid } from '../engine/model';
import { calibrateSettings, gridsOf, saveGrids } from '../engine/state';
import { useMapState } from '@/components/map/engine-context';

/** Fonds déjà examinés pendant la session (un essai par fond et par scène). */
const tried = new Set<string>();
const DISMISSED = 'vtt:carte:echelle-laissee:';

function dismissed(key: string): boolean {
  try {
    return localStorage.getItem(DISMISSED + key) === '1';
  } catch {
    return false;
  }
}

/** Lance le calibrage de la grille de jeu (créée au besoin, à la case actuelle de la scène). */
export function calibrateScene(engine: MapEngine) {
  const grids = gridsOf(engine);
  let play = playGridOf({ grids });
  const run = () => {
    if (!play) return;
    calibrateSettings(engine).setState({ gridId: play.id, cells: 1 });
    engine.tools.activate(GRID_CALIBRATE_TOOL_ID);
    toast(translate('map.grid.dragOne'), {
      description: translate('map.grid.escapeToCancel'),
    });
  };
  if (play) return run();
  const s = engine.store.getState();
  const created = newGrid(grids, scenePixelsPerUnit(s.scene as never, s.settings as never));
  if (!created) return;
  play = { ...created, visibleToPlayers: false };
  void Promise.resolve(saveGrids(engine, translate('map.grid.playGrid'), [...grids, play])).then(
    run,
  );
}

/**
 * Cherche le quadrillage du fond de la scène affichée et en fait la grille de jeu (cachée aux
 * joueurs, commande annulable). Vrai s'il est trouvé.
 */
export async function detectSceneGrid(engine: MapEngine): Promise<boolean> {
  const scene = engine.store.getState().scene;
  const url = (scene?.backgroundUrl as string | null | undefined) ?? null;
  const width = (scene?.width as number | null | undefined) ?? undefined;
  if (!url) return false;
  const video = isVideoUrl(url);
  const found = await detectGrid(video ? (videoVariant(url) ?? url) : url, video, width);
  if (!found) return false;
  const grids = gridsOf(engine);
  const play = playGridOf({ grids });
  const placed = {
    size: Math.round(found.size * 100) / 100,
    offsetX: Math.round(found.offsetX * 100) / 100,
    offsetY: Math.round(found.offsetY * 100) / 100,
  };
  if (play) {
    await saveGrids(engine, translate('map.grid.detected'), withGrid(grids, play.id, placed));
  } else {
    const created = newGrid(grids, found.size);
    if (!created) return false;
    await saveGrids(engine, translate('map.grid.detected'), [
      ...grids,
      { ...created, ...placed, visibleToPlayers: false },
    ]);
  }
  toast.success(translate('map.grid.detectedSize', { size: Math.round(found.size) }), {
    action: { label: translate('map.grid.fit'), onClick: () => calibrateScene(engine) },
  });
  return true;
}

export function GridScaleAssistant({ engine }: Readonly<{ engine: MapEngine }>) {
  const scene = useMapState((s) => s.scene);
  const url = (scene?.backgroundUrl as string | null | undefined) ?? null;
  const width = (scene?.width as number | null | undefined) ?? null;
  const grids = (scene?.grids as MapGrid[] | undefined) ?? [];
  const hasPlayGrid = grids.some((g) => g.primary);
  const key = scene && url ? `${scene.id}|${url}` : null;
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    // Un fond chargé (taille connue), sans grille de jeu, pas encore examiné
    if (!key || !url || !width || hasPlayGrid || tried.has(key) || dismissed(key)) return;
    tried.add(key);
    let alive = true;
    void detectSceneGrid(engine).then((found) => {
      if (alive && !found) setBanner(key);
    });
    return () => {
      alive = false;
    };
  }, [engine, key, url, width, hasPlayGrid]);

  const shown = banner !== null && banner === key && !hasPlayGrid;
  const close = (remember: boolean) => {
    if (remember && key)
      try {
        localStorage.setItem(DISMISSED + key, '1');
      } catch {
        // Stockage indisponible : le bandeau reviendra à la prochaine ouverture
      }
    setBanner(null);
  };

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="pointer-events-auto absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-border-strong bg-background/95 py-1.5 pl-3 pr-1.5 shadow-elevated"
          role="status"
        >
          <Ruler className="size-4 text-primary" aria-hidden />
          <span className="text-sm font-medium">{translate('map.grid.mapScale')}</span>
          <Button
            size="sm"
            onClick={() => {
              calibrateScene(engine);
              close(false);
            }}
          >
            {translate('map.grid.calibrate')}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => close(true)}
            aria-label={translate('map.grid.later')}
          >
            <X />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
