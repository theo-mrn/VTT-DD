'use client';

/**
 * « Rapports d'attaque » du menu ⋯ de la barre du MJ (docs/combat.md § 12.4, § 12.6) : ce que
 * la pile en direct ne montre pas. Décidés et tous, ce combat ou hors combat, un personnage ;
 * « Tout appliquer » (revue groupée), « Annuler l'application », « Modifier » (tiroir).
 */
import type { CombatState } from '@vtt/contracts';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { BulkReview } from '../reports/bulk-review';
import { DecisionDrawer } from '../reports/decision-drawer';
import { isPending } from '../reports/model';
import { ReportsSection } from '../reports/report-list';
import { DEFAULT_REPORT_VIEW, useReports, type ReportView } from '../reports/use-reports';
import { combatPresentation } from '../turns/use-cast';
import type { LiveReports } from '../live-reports/use-live-reports';
import { DotsBackdrop } from '../backdrop';

export function ReportsDialog({
  open,
  onOpenChange,
  combat,
  live,
  onOpenCharacter,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  combat: CombatState | null;
  live: LiveReports;
  onOpenCharacter(characterId: string): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="isolate flex h-[min(88dvh,52rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DotsBackdrop />
        <DialogTitle className="sr-only">Rapports d’attaque</DialogTitle>
        {open && <ReportsBody combat={combat} live={live} onOpenCharacter={onOpenCharacter} />}
      </DialogContent>
    </Dialog>
  );
}

function ReportsBody({
  combat,
  live,
  onOpenCharacter,
}: {
  combat: CombatState | null;
  live: LiveReports;
  onOpenCharacter(characterId: string): void;
}) {
  const { campaignId, systeme, presentation, cast } = live;
  // La pile montre déjà l'attente : l'historique s'ouvre sur tout
  const [view, setView] = useState<ReportView>({ ...DEFAULT_REPORT_VIEW, filter: 'all' });
  const data = useReports(campaignId, combat, view);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const attack = deciding ? data.find(deciding) : null;
  return (
    // Section à fond perdu : le dialogue est son cadre ; la croix garde sa place en haut
    <div className="flex min-h-0 flex-1 flex-col [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:shadow-none [&>section>header]:pr-12">
      <ReportsSection
        campaignId={campaignId}
        combat={combat}
        data={data}
        view={view}
        onView={setView}
        systeme={systeme}
        presentation={presentation}
        cast={cast}
        columns={1}
        fill
        onDecide={setDeciding}
        onReview={() => setReviewing(true)}
        onOpenCharacter={onOpenCharacter}
      />
      <DecisionDrawer
        campaignId={campaignId}
        attack={attack && isPending(attack) ? attack : null}
        systeme={systeme}
        cast={cast}
        stateSorts={combatPresentation(presentation).stateSorts}
        onClose={() => setDeciding(null)}
      />
      <BulkReview
        open={reviewing}
        onOpenChange={setReviewing}
        campaignId={campaignId}
        attacks={data.toReview}
        systeme={systeme}
        cast={cast}
      />
    </div>
  );
}
