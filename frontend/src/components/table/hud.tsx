'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { CombatState } from '@vtt/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useMemo } from 'react';
import { GmCombatBar } from '@/components/combat/bar/gm-combat-bar';
import { LiveReports } from '@/components/combat/live-reports/live-reports';
import { HUD_BAR, HUD_CONTROL } from '@/components/combat/live-reports/look';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { useLiveReports } from '@/components/combat/live-reports/use-live-reports';
import { ReactionPrompts } from '@/components/combat/player/reaction-prompt';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useCombat } from '@/lib/combat/use-combat';
import type { DetailCampagne } from '@/lib/campagnes';
import { cn } from '@/lib/utils';
import type { Table } from './contexte';
import { useHudPrefs, useHudPrefsHydration } from './hud-prefs';

/** Sortie seule (retour au salon), quand aucune scène n'affiche la barre du groupe. */
export const HudExit = memo(function HudExit({ table }: { table: Table }) {
  return (
    <div data-hud-exit className={HUD_BAR}>
      <Info texte="Retour au salon" cote="bottom">
        <Button variant="ghost" size="icon-sm" asChild className={HUD_CONTROL}>
          <Link href={`/campagnes/${table.campagne.id}`} aria-label="Retour au salon">
            <ArrowLeft />
          </Link>
        </Button>
      </Info>
    </div>
  );
});

/**
 * Au centre : la barre de combat du MJ (docs/combat.md § 12.6), en combat comme hors combat, et
 * dessous ses rapports d'attaque en direct, un seul ensemble ; pour un joueur, les invites de
 * défense active quand son personnage est attaqué (en combat ou non).
 */
export const HudCombat = memo(function HudCombat({ table }: { table: Table }) {
  const { campagne: c, gm, moi } = table;
  const { combat, isLoading } = useCombat(c.id);
  const role = gm ? 'gm' : moi.role;
  const mine = useMemo(
    () => new Set(c.characters.filter((e) => e.playedBy === moi.userId).map((e) => e.characterId)),
    [c.characters, moi.userId],
  );
  const reacts = role === 'player' && mine.size > 0;
  const sys = useCampaignSystem(reacts ? c.system : null, c.id);
  if (role !== 'gm' && !reacts) return null;
  return (
    <div className="pointer-events-none flex min-w-0 max-w-full flex-1 flex-col items-center gap-2">
      {role === 'gm' && !isLoading && <GmCombat campagne={c} combat={combat} />}
      {reacts && (
        <ReactionPrompts campaignId={c.id} mine={mine} systeme={sys.data?.systeme ?? null} />
      )}
    </div>
  );
});

/** Barre du MJ et pile de rapports : l'état des rapports est partagé (pastille, repli). */
function GmCombat({ campagne, combat }: { campagne: DetailCampagne; combat: CombatState | null }) {
  const live = useLiveReports(campagne);
  useHudPrefsHydration();
  // Hors combat, la barre peut être rangée (bouton de la barre du groupe) ; les rapports restent
  const idle = useHudPrefs((s) => s.combatBarIdle);
  return (
    <>
      <AnimatePresence initial={false}>
        {(combat !== null || idle) && (
          <motion.div
            key="bar"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <GmCombatBar campagne={campagne} combat={combat} live={live} />
          </motion.div>
        )}
      </AnimatePresence>
      <LiveReports live={live} campagne={campagne} combat={combat} />
    </>
  );
}
