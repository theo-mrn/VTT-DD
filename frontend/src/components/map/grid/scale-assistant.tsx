'use client';

/**
 * Échelle d'un nouveau fond (MJ, docs/carte.md § 4) : sans grille de jeu, la case est une part
 * de la largeur du fond (repli, `scenePixelsPerUnit`). Ici, une fois par fond :
 * - le quadrillage dessiné dans l'image est cherché (`detectGrid`) ; trouvé, il devient la
 *   grille de jeu, cachée aux joueurs (l'image a déjà ses lignes), en une commande annulable ;
 * - sinon un bandeau propose de calibrer (glisser sur une case de l'image) ou de laisser le repli.
 */
import type { MapGrid } from '@vtt/contracts';
import { playGridOf, scenePixelsPerUnit } from '@vtt/contracts';
import { Ruler, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isVideoUrl, videoVariant } from '@/lib/map/engine/background-prefs';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { detectGrid } from '@/lib/map/modules/grid/detect';
import { GRID_CALIBRATE_TOOL_ID, newGrid } from '@/lib/map/modules/grid/model';
import { calibrateSettings, gridsOf, saveGrids } from '@/lib/map/modules/grid/state';
import { useMapState } from '../engine-context';

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
function calibrate(engine: MapEngine) {
  const grids = gridsOf(engine);
  let play = playGridOf({ grids });
  const run = () => {
    if (!play) return;
    calibrateSettings(engine).setState({ gridId: play.id, cells: 1 });
    engine.tools.activate(GRID_CALIBRATE_TOOL_ID);
    toast('Glissez d’un coin à l’autre d’une case de l’image', {
      description: 'Échap pour annuler.',
    });
  };
  if (play) return run();
  const s = engine.store.getState();
  const created = newGrid(grids, scenePixelsPerUnit(s.scene as never, s.settings as never));
  if (!created) return;
  play = { ...created, visibleToPlayers: false };
  void Promise.resolve(saveGrids(engine, 'Grille de jeu', [...grids, play])).then(run);
}

export function GridScaleAssistant({ engine }: { engine: MapEngine }) {
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
    const video = isVideoUrl(url);
    void detectGrid(video ? (videoVariant(url) ?? url) : url, video, width).then((found) => {
      if (!alive) return;
      if (!found) return setBanner(key);
      const existing = gridsOf(engine);
      const created = newGrid(existing, found.size);
      if (!created) return setBanner(key);
      const grid: MapGrid = {
        ...created,
        size: Math.round(found.size * 100) / 100,
        offsetX: Math.round(found.offsetX * 100) / 100,
        offsetY: Math.round(found.offsetY * 100) / 100,
        visibleToPlayers: false,
      };
      void saveGrids(engine, 'Quadrillage détecté', [...existing, grid]);
      toast.success(`Quadrillage détecté : ${Math.round(found.size)} px par case`, {
        action: { label: 'Ajuster', onClick: () => calibrate(engine) },
      });
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
          <span className="text-sm font-medium">Échelle de la carte</span>
          <Button
            size="sm"
            onClick={() => {
              calibrate(engine);
              close(false);
            }}
          >
            Calibrer
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => close(true)} aria-label="Plus tard">
            <X />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
