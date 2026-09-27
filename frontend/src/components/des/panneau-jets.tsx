'use client';

import { BarChart3, History, Radio, Swords, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Info } from '@/components/ui/tooltip';
import { useStatsJets, type Jet } from '@/lib/jets';
import { EffacerHistorique, HistoriqueJets, type PlusAnciens } from './historique-jets';
import { StatsJets } from './stats-jets';

/**
 * Colonne de droite : historique et statistiques du contexte courant (jets
 * personnels, ou ceux de la campagne choisie), servis par le service dice et
 * tenus à jour en direct. Collée sous la barre haute sur grand écran, elle
 * défile seule.
 */
export function PanneauJets({
  jets,
  chargement,
  erreur,
  moi,
  roomId,
  campagne,
  peutEffacer,
  live,
  plusAnciens,
  onRelancer,
  onEfface,
}: {
  jets: Jet[];
  chargement: boolean;
  erreur: unknown;
  moi: string | null;
  roomId: string | null;
  /** Nom de la campagne dont on voit les jets, ou null pour les jets personnels. */
  campagne: string | null;
  /** Jets personnels, ou MJ de la campagne : l'historique peut être vidé. */
  peutEffacer: boolean;
  /** Temps réel actif : les jets de la table arrivent sans recharger. */
  live: boolean;
  plusAnciens: PlusAnciens;
  onRelancer: (jet: Jet) => void;
  onEfface: () => void;
}) {
  const [onglet, setOnglet] = useState('historique');
  const stats = useStatsJets(roomId, onglet === 'stats');
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
                <span className="font-mono text-[11px] text-subtle tabular">
                  {jets.length}
                  {plusAnciens.possible ? '+' : ''}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart3 aria-hidden />
              Statistiques
            </TabsTrigger>
          </TabsList>
          {peutEffacer && (
            <EffacerHistorique
              roomId={roomId}
              campagne={campagne}
              desactive={!jets.length}
              onEfface={onEfface}
            />
          )}
        </div>
        <p className="flex items-center gap-1.5 border-b border-border px-5 pb-3 text-[11px] text-subtle">
          <Contexte className="size-3 shrink-0" aria-hidden />
          <span className="truncate">
            {onglet === 'stats' && !campagne
              ? 'Tous vos jets, campagnes comprises'
              : (campagne ?? 'Jets personnels')}
          </span>
          {campagne && live && (
            <Info texte="En direct : les jets de la table arrivent tout seuls">
              <span className="ml-auto flex shrink-0 items-center gap-1 text-success">
                <Radio className="size-3" aria-hidden />
                En direct
              </span>
            </Info>
          )}
        </p>

        <TabsContent value="historique" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <HistoriqueJets
            jets={jets}
            chargement={chargement}
            erreur={erreur}
            moi={moi}
            onRelancer={onRelancer}
            plusAnciens={plusAnciens}
          />
        </TabsContent>
        <TabsContent value="stats" className="mt-0 min-h-0 flex-1 overflow-y-auto">
          <StatsJets stats={stats.data ?? null} chargement={stats.isPending} erreur={stats.error} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
