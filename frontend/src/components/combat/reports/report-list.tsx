'use client';

/**
 * Onglet « Rapports » du panneau Combat (docs/combat.md § 7, § 12.4) : tous les rapports
 * d'attaque, pas seulement ceux du participant qui agit (l'ancienne app perdait les autres).
 * Filtres : en attente (résolus, et en cours), décidés, tous ; ce combat, hors combat.
 * « Tout appliquer (n) » ouvre la revue groupée ; « Modifier » ouvre le tiroir de décision.
 */
import type { Attack, CombatState } from '@vtt/contracts';
import { CheckCheck, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chips, ListSkeleton, Notice } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { useCampaignSystem } from '@/lib/campaign-settings';
import type { DetailCampagne } from '@/lib/campagnes';
import { combatErrorMessage } from '@/lib/combat/api';
import { useAttacks } from '@/lib/combat/use-attacks';
import { combatPresentation, useCast } from '../turns/use-cast';
import { BulkReview } from './bulk-review';
import { DecisionDrawer } from './decision-drawer';
import { bulkRows, filterReports, isPending, type ReportFilter, type ReportScope } from './model';
import { ReportCard } from './report-card';

const PAGE = 50;

/** Les plus récentes d'abord, sans doublon (une attaque peut venir de deux listes). */
function merge(...lists: (readonly Attack[])[]): Attack[] {
  const byId = new Map<string, Attack>();
  for (const list of lists)
    for (const a of list) {
      const known = byId.get(a.id);
      if (!known || known.version < a.version) byId.set(a.id, a);
    }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function ReportList({
  campagne,
  combat,
}: {
  campagne: DetailCampagne;
  combat: CombatState | null;
}) {
  const campaignId = campagne.id;
  const [filter, setFilter] = useState<ReportFilter>('pending');
  const [scope, setScope] = useState<ReportScope>('all');
  const [limit, setLimit] = useState(PAGE);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const cast = useCast(campaignId);
  const sys = useCampaignSystem(campagne.system, campaignId);
  const systeme = sys.data?.systeme ?? null;
  const presentation = sys.data?.presentation ?? null;
  const { stateSorts } = combatPresentation(presentation);

  // En attente : résolues et en cours (toujours chargées, pour la pastille et la revue)
  const pending = useAttacks(campaignId, { status: 'pending', limit: 100 });
  const open = useAttacks(campaignId, { status: 'open', limit: 50 });
  const history = useAttacks(
    campaignId,
    { status: filter === 'decided' ? 'decided' : 'all', limit },
    { enabled: filter !== 'pending' },
  );

  const all = useMemo(
    () =>
      filter === 'pending'
        ? merge(open.attacks, pending.attacks)
        : merge(history.attacks, filter === 'all' ? [...open.attacks, ...pending.attacks] : []),
    [filter, open.attacks, pending.attacks, history.attacks],
  );
  const shown = filterReports(all, filter, scope, combat?.id ?? null);
  const toReview = pending.attacks.filter(isPending);
  const reviewCount = bulkRows(toReview).length;
  const decidingAttack = deciding ? (all.find((a) => a.id === deciding) ?? null) : null;
  const loading = filter === 'pending' ? pending.isLoading || open.isLoading : history.isLoading;
  const error = pending.error ?? open.error ?? (filter !== 'pending' ? history.error : null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chips
          label="Rapports"
          value={filter}
          onChange={(v) => {
            setFilter(v as ReportFilter);
            setLimit(PAGE);
          }}
          options={[
            { value: 'pending', label: 'En attente', count: toReview.length + open.attacks.length },
            { value: 'decided', label: 'Décidés' },
            { value: 'all', label: 'Tous' },
          ]}
        />
        <span className="flex-1" />
        <Button size="sm" onClick={() => setReviewing(true)} disabled={!reviewCount}>
          <CheckCheck />
          Tout appliquer ({reviewCount})
        </Button>
      </div>
      {combat && (
        <Chips
          label="Combat"
          value={scope}
          onChange={(v) => setScope(v as ReportScope)}
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'combat', label: 'Ce combat' },
            { value: 'outside', label: 'Hors combat' },
          ]}
        />
      )}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <Notice
          tone="error"
          icon={ScrollText}
          title="Rapports indisponibles"
          description={combatErrorMessage(error)}
        />
      ) : shown.length === 0 ? (
        <Notice
          icon={ScrollText}
          title={filter === 'pending' ? 'Aucun rapport en attente' : 'Aucun rapport'}
          description={
            filter === 'pending'
              ? 'Chaque attaque résolue arrive ici : rien n’est appliqué sans votre décision.'
              : 'Les attaques décidées apparaîtront ici, avec ce qui a été appliqué.'
          }
        />
      ) : (
        <ul className="space-y-2.5" aria-label="Rapports d’attaque">
          {shown.map((a) => (
            <li key={a.id}>
              <ReportCard
                campaignId={campaignId}
                attack={a}
                systeme={systeme}
                presentation={presentation}
                cast={cast.byId}
                onDecide={(x) => setDeciding(x.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {filter !== 'pending' && history.hasMore && limit < 100 && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit(100)}>
            Plus anciens
          </Button>
        </div>
      )}

      <DecisionDrawer
        campaignId={campaignId}
        attack={decidingAttack && isPending(decidingAttack) ? decidingAttack : null}
        systeme={systeme}
        cast={cast.byId}
        stateSorts={stateSorts}
        onClose={() => setDeciding(null)}
      />
      <BulkReview
        open={reviewing}
        onOpenChange={setReviewing}
        campaignId={campaignId}
        attacks={toReview}
        systeme={systeme}
        cast={cast.byId}
      />
    </div>
  );
}
