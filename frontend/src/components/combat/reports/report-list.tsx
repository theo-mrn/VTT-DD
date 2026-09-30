'use client';

/**
 * « Rapports d'attaque » du panneau Combat (docs/combat.md § 7, § 12.4), sous les cartes de la
 * colonne de droite, sur tout l'espace restant : « x/y appliqués », « Tout appliquer (n) »
 * (revue groupée), filtres (en attente, décidés, tous ; ce combat, hors combat ; un
 * personnage), puis une carte par cible et les coûts des attaquants à part. Tous les rapports
 * de la campagne, pas seulement ceux du participant qui agit (l'ancienne app perdait les
 * autres).
 */
import type { CombatState } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { CheckCheck, EyeOff, ScrollText, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Chips, ListSkeleton, Notice } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { SelectField } from '@/components/ui/select';
import { Info } from '@/components/ui/tooltip';
import { combatErrorMessage } from '@/lib/combat/api';
import { cn } from '@/lib/utils';
import { COMBAT_SHORTCUTS } from '../turns/shortcuts';
import type { CastMember } from '../turns/use-cast';
import type { ReportFilter, ReportScope } from './model';
import { ActorCostCard, ReportCard } from './report-card';
import type { ReportView, ReportsData } from './use-reports';

const ITEM_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.14 } },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
} as const;

export function ReportsSection({
  campaignId,
  combat,
  data,
  view,
  onView,
  systeme,
  presentation,
  cast,
  columns,
  fill,
  onDecide,
  onReview,
  onOpenCharacter,
}: {
  campaignId: string;
  combat: CombatState | null;
  data: ReportsData;
  view: ReportView;
  onView(view: ReportView): void;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  cast: ReadonlyMap<string, CastMember>;
  columns: 1 | 2;
  /** Colonne de droite : la section prend tout l'espace restant et défile seule. */
  fill: boolean;
  onDecide(attackId: string): void;
  onReview(): void;
  onOpenCharacter(characterId: string): void;
}) {
  const { progress } = data;
  const nameOf = (id: string) => cast.get(id)?.name ?? 'Personnage';
  const characters = [
    ...new Set([...data.characters, ...(view.characterId ? [view.characterId] : [])]),
  ];

  return (
    <section
      aria-label="Rapports d’attaque"
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-card/60 shadow-surface',
        fill && 'min-h-0 flex-1',
      )}
    >
      <header className="space-y-2 border-b border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ScrollText className="size-4 text-primary" aria-hidden />
            Rapports d’attaque
          </h3>
          {progress.total > 0 && (
            <Info
              texte={
                progress.skipped
                  ? `${progress.skipped} non appliqué${progress.skipped > 1 ? 's' : ''}, ${progress.pending} en attente`
                  : `${progress.pending} en attente`
              }
            >
              <span className="cursor-help font-mono text-xs tabular-nums text-muted-foreground">
                {progress.applied}/{progress.total} appliqué{progress.applied > 1 ? 's' : ''}
              </span>
            </Info>
          )}
          <span className="flex-1" />
          <Info
            texte={
              <span className="flex items-center gap-2">
                Revue groupée, valeurs modifiables <Kbd>{COMBAT_SHORTCUTS.applyAll.label}</Kbd>
              </span>
            }
          >
            <Button
              size="sm"
              onClick={onReview}
              disabled={!data.reviewCount}
              aria-keyshortcuts={COMBAT_SHORTCUTS.applyAll.aria}
            >
              <CheckCheck />
              Tout appliquer ({data.reviewCount})
            </Button>
          </Info>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chips
            label="Rapports"
            value={view.filter}
            onChange={(v) => onView({ ...view, filter: v as ReportFilter })}
            options={[
              { value: 'pending', label: 'En attente', count: data.waiting },
              { value: 'decided', label: 'Décidés' },
              { value: 'all', label: 'Tous' },
            ]}
          />
          {combat && (
            <SelectField
              value={view.scope}
              onValueChange={(v) => onView({ ...view, scope: v as ReportScope })}
              className="h-8 w-36 text-xs"
              aria-label="Combat"
              options={[
                { valeur: 'all', nom: 'Tout' },
                { valeur: 'combat', nom: 'Ce combat' },
                { valeur: 'outside', nom: 'Hors combat' },
              ]}
            />
          )}
          {(characters.length > 1 || view.characterId) && (
            <span className="flex items-center gap-1">
              <SelectField
                value={view.characterId ?? ''}
                onValueChange={(v) => onView({ ...view, characterId: v || null })}
                className="h-8 w-44 text-xs"
                aria-label="Personnage"
                options={[
                  { valeur: '', nom: 'Tous les personnages' },
                  ...characters.map((id) => ({ valeur: id, nom: nameOf(id) })),
                ]}
              />
              {view.characterId && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => onView({ ...view, characterId: null })}
                  aria-label="Retirer le filtre du personnage"
                >
                  <X />
                </Button>
              )}
            </span>
          )}
          {view.filter === 'pending' && data.recentCount > 0 && (
            <Button size="xs" variant="ghost" onClick={data.clearRecent} className="ml-auto">
              <EyeOff />
              Ranger les décidés ({data.recentCount})
            </Button>
          )}
        </div>
      </header>

      <div className={cn('p-3', fill && 'min-h-0 flex-1 overflow-y-auto overscroll-contain')}>
        {data.loading ? (
          <ListSkeleton rows={3} />
        ) : data.error ? (
          <Notice
            tone="error"
            icon={ScrollText}
            title="Rapports indisponibles"
            description={combatErrorMessage(data.error)}
          />
        ) : data.items.length === 0 ? (
          <Notice
            icon={ScrollText}
            title={view.filter === 'pending' ? 'Aucune attaque enregistrée' : 'Aucun rapport'}
            description={
              view.characterId
                ? `Rien pour ${nameOf(view.characterId)} avec ces filtres.`
                : view.filter === 'pending'
                  ? 'Chaque attaque résolue arrive ici : rien n’est appliqué sans votre décision.'
                  : 'Les attaques décidées apparaîtront ici, avec ce qui a été appliqué.'
            }
          />
        ) : (
          <ul
            className={cn('grid items-start gap-2.5', columns === 2 && 'grid-cols-2')}
            aria-label="Cartes des rapports, une par cible"
          >
            <AnimatePresence initial={false}>
              {data.items.map((item) => (
                <motion.li
                  key={item.key}
                  layout="position"
                  {...ITEM_MOTION}
                  className={cn('h-full', item.kind === 'actor' && 'col-span-full')}
                >
                  {item.kind === 'target' ? (
                    <ReportCard
                      campaignId={campaignId}
                      attack={item.attack}
                      target={item.target}
                      index={item.index}
                      count={item.count}
                      systeme={systeme}
                      presentation={presentation}
                      cast={cast}
                      onDecide={(a) => onDecide(a.id)}
                      onOpenCharacter={onOpenCharacter}
                      onFilter={(id) => onView({ ...view, characterId: id })}
                    />
                  ) : (
                    <ActorCostCard
                      campaignId={campaignId}
                      attack={item.attack}
                      systeme={systeme}
                      cast={cast}
                    />
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {data.canLoadMore && (
          <div className="mt-3 flex justify-center">
            <Button variant="ghost" size="sm" onClick={data.loadMore}>
              Plus anciens
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
