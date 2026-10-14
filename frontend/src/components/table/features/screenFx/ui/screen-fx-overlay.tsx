'use client';

import { Snowflake } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useStore } from 'zustand';
import { useCampaignEvents } from '@/lib/realtime';
import { useTable } from '../../../contexte';
import { isOneShot, shownMood, type Mood } from '../state';
import { playOneShot } from './play';

/** Calque de chaque ambiance (au-dessus de la carte, sous les panneaux). */
const MOOD_LAYER: Record<Mood, string> = {
  dark: 'bg-black/55',
  danger:
    'animate-pulse bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(150,0,0,0.55)_100%)]',
  // Aucune teinte : de grands flocons dans les coins et sur les bords (`Flocons`)
  cold: '',
  dream:
    'backdrop-blur-[2px] backdrop-saturate-[.6] bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(180,140,255,0.25)_100%)]',
};

/**
 * Flocons de l'ambiance « froid » : grands, posés dans les coins et le long des bords (débordant
 * de l'écran), blancs translucides ; ils tournent et dérivent lentement. Position en % de
 * l'écran, taille en px, opacité, durée d'un tour.
 */
const FLOCONS = [
  { x: -3, y: -4, size: 190, opacity: 0.55, spin: 90 },
  { x: 9, y: 6, size: 64, opacity: 0.4, spin: 60 },
  { x: 2, y: 22, size: 90, opacity: 0.35, spin: 75 },
  { x: 93, y: -5, size: 170, opacity: 0.5, spin: 100 },
  { x: 86, y: 8, size: 70, opacity: 0.35, spin: 55 },
  { x: 97, y: 30, size: 80, opacity: 0.3, spin: 80 },
  { x: -4, y: 84, size: 160, opacity: 0.5, spin: 95 },
  { x: 10, y: 92, size: 60, opacity: 0.35, spin: 65 },
  { x: 92, y: 82, size: 200, opacity: 0.55, spin: 110 },
  { x: 84, y: 94, size: 66, opacity: 0.35, spin: 70 },
  { x: 48, y: -6, size: 72, opacity: 0.25, spin: 85 },
  { x: 52, y: 97, size: 78, opacity: 0.25, spin: 90 },
] as const;

function Flocons() {
  return (
    <>
      {FLOCONS.map((f, i) => (
        // Placement fixe (centré sur son point) ; le mouvement est sur l'enfant, motion
        // remplaçant le `transform` de l'élément qu'il anime
        <span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${f.x}%`, top: `${f.y}%`, opacity: f.opacity }}
        >
          <motion.span
            className="block text-white drop-shadow-[0_0_6px_rgba(0,0,0,0.25)]"
            animate={{ rotate: i % 2 ? -360 : 360, y: [0, 10, 0] }}
            transition={{
              rotate: { duration: f.spin, repeat: Infinity, ease: 'linear' },
              y: { duration: 7 + (i % 4), repeat: Infinity, ease: 'easeInOut' },
            }}
          >
            <Snowflake style={{ width: f.size, height: f.size }} strokeWidth={1.1} />
          </motion.span>
        </span>
      ))}
    </>
  );
}

/**
 * Effets d'écran chez tous : joue les effets ponctuels reçus (`table.fx`) et pose le calque de
 * l'ambiance affichée sur cet écran (la sienne, sinon celle de la table).
 */
export function ScreenFxOverlay() {
  const { campagne, gm } = useTable();
  const actuelle = useStore(shownMood.store, (s) => s.value);

  // Effet ponctuel lancé par le MJ (ou un automatisme) : joué chez chacun, MJ compris, sauf un
  // effet adressé à des joueurs (le MJ le reçoit aussi, sans le jouer)
  useCampaignEvents(campagne.id, ['table.fx'], (e) => {
    const { effect, userIds } = e.event.payload as { effect?: unknown; userIds?: unknown };
    if (gm && Array.isArray(userIds)) return;
    if (isOneShot(effect)) playOneShot(effect);
  });

  return (
    <AnimatePresence>
      {actuelle && (
        <motion.div
          key={actuelle}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          className={`pointer-events-none fixed inset-0 z-[25] overflow-hidden ${MOOD_LAYER[actuelle]}`}
        >
          {actuelle === 'cold' && <Flocons />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
