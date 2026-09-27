'use client';

import { BarChart3, History, Swords, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Jet } from '@/lib/jets';
import { EffacerHistorique, HistoriqueJets } from './historique-jets';
import { StatsJets } from './stats-jets';

/**
 * Colonne de droite : historique et statistiques du contexte courant (jets
 * personnels, ou ceux de la campagne choisie). Collée sous la barre haute sur
 * grand écran, elle défile seule.
 */
export function PanneauJets({
  jets,
  chargement,
  erreur,
  moi,
  campagne,
  onRelancer,
  onEfface,
}: {
  jets: Jet[];
  chargement: boolean;
  erreur: unknown;
  moi: string | null;
  /** Nom de la campagne dont on voit les jets, ou null pour les jets personnels. */
  campagne: string | null;
  onRelancer: (jet: Jet) => void;
  onEfface: () => void;
}) {
  const [onglet, setOnglet] = useState('historique');
  const Contexte = campagne ? Swords : UserRound;

  return (
    <aside
      aria-label="Historique et statistiques"
      className="flex min-w-0 flex-col rounded-2xl border border-border bg-card shadow-surface xl:sticky xl:top-[72px] xl:max-h-[calc(100dvh-88px)]"
    >
      <Tabs value={onglet} onValueChange={setOnglet} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-4">
          <TabsList>
            <TabsTrigger value="historique">
              <History aria-hidden />
              Historique
              {jets.length > 0 && (
                <span className="font-mono text-[11px] text-subtle tabular">{jets.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart3 aria-hidden />
              Statistiques
            </TabsTrigger>
          </TabsList>
          <EffacerHistorique desactive={!jets.length} onEfface={onEfface} />
        </div>
        <p className="flex items-center gap-1.5 border-b border-border px-5 pb-3 text-[11px] text-subtle">
          <Contexte className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{campagne ?? 'Jets personnels'}</span>
        </p>

        <TabsContent value="historique" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <HistoriqueJets
            jets={jets}
            chargement={chargement}
            erreur={erreur}
            moi={moi}
            onRelancer={onRelancer}
          />
        </TabsContent>
        <TabsContent value="stats" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <StatsJets jets={jets} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
