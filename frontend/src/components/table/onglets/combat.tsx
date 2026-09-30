'use client';

/**
 * Panneau « Combat » du MJ (touche M ; docs/combat.md § 12.3), qui remplace le panneau MJ :
 * - Tours : démarrer un combat, round, Précédent et Suivant, initiative, créneaux, ordre,
 *   participants et leurs fiches, fin du combat ;
 * - Rapports : les rapports d'attaque à décider (appliquer, modifier, écarter, annuler) ;
 * - Héros : l'ancien panneau MJ, à l'identique.
 * L'onglet ouvert par défaut suit la table : Tours en combat, Rapports s'il en reste à
 * décider, Héros sinon ; le choix du MJ est gardé tant que la table est ouverte.
 */
import { Crown, Lock, ScrollText, Swords } from 'lucide-react';
import { useState } from 'react';
import { EtatVide, Page } from '@/components/commun/page';
import { DefeatedDialog } from '@/components/combat/reports/defeated-dialog';
import { pendingCount } from '@/components/combat/reports/model';
import { ReportList } from '@/components/combat/reports/report-list';
import { HeroesTab } from '@/components/combat/turns/heroes';
import { TurnsPanel } from '@/components/combat/turns/turns-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAttacks } from '@/lib/combat/use-attacks';
import { useCombat } from '@/lib/combat/use-combat';
import { useTable } from '../contexte';

type CombatTab = 'turns' | 'reports' | 'heroes';

export function OngletCombat() {
  const { gm } = useTable();
  if (!gm)
    return (
      <Page>
        <EtatVide
          icone={Lock}
          titre="Réservé au maître du jeu"
          description="Ce panneau mène les tours et les rapports d’attaque de la table."
        />
      </Page>
    );
  return <CombatPanel />;
}

function CombatPanel() {
  const { campagne } = useTable();
  const { combat, isLoading } = useCombat(campagne.id);
  const pending = useAttacks(campagne.id, { status: 'pending', limit: 100 });
  const count = pendingCount(pending.attacks);
  const [chosen, setChosen] = useState<CombatTab | null>(null);
  const tab: CombatTab = chosen ?? (combat ? 'turns' : count > 0 ? 'reports' : 'heroes');

  return (
    <div className="px-4 pb-6 sm:px-5">
      <Tabs value={tab} onValueChange={(v) => setChosen(v as CombatTab)}>
        <div className="sticky top-14 z-20 -mx-4 bg-background/95 px-4 pb-2 pt-3 backdrop-blur sm:-mx-5 sm:px-5">
          <TabsList className="w-full">
            <TabsTrigger value="turns" className="flex-1">
              <Swords />
              Tours
              {combat && (
                <span className="rounded-full bg-primary/15 px-1.5 text-[11px] tabular-nums text-primary-strong">
                  R{combat.round}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex-1">
              <ScrollText />
              Rapports
              {count > 0 && (
                <span
                  className="rounded-full bg-destructive px-1.5 text-[11px] font-semibold tabular-nums text-destructive-foreground"
                  aria-label={`${count} en attente`}
                >
                  {count}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="heroes" className="flex-1">
              <Crown />
              Héros
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="turns" className="mt-3">
          <TurnsPanel
            campagne={campagne}
            combat={combat}
            loading={isLoading}
            pendingReports={count}
          />
        </TabsContent>
        <TabsContent value="reports" className="mt-3">
          <ReportList campagne={campagne} combat={combat} />
        </TabsContent>
        <TabsContent value="heroes" className="mt-3">
          <HeroesTab campagne={campagne} />
        </TabsContent>
      </Tabs>
      {/* Personnages tombés après une application : un seul dialogue pour tous */}
      <DefeatedDialog campagne={campagne} combat={combat} />
    </div>
  );
}
