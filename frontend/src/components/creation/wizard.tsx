'use client';

/**
 * Création de personnage, reprise de l'ancienne interface : une barre
 * d'onglets (une étape du système par onglet, dans l'ordre déclaré, puis le
 * portrait et la fin), chaque onglet enchaînant ses sous-étapes. L'état de
 * chaque étape vient du serveur (`GET /creation`), sinon du même calcul local
 * (`etapesCreation`) pendant une écriture.
 */
import { etapesCreation, type EtapeCreation, type EtatEtape } from '@vtt/rules';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Check,
  Dices,
  ImageIcon,
  LayoutGrid,
  PenLine,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { getCreationSteps, useVersionedRead } from '@/lib/characters';
import { afterCreationPath } from '@/lib/rooms';
import { cn } from '@/lib/utils';
import { useSheet } from '../sheet/context';
import { accentButton, focus, text, textMuted, titleFont } from '../sheet/styles';
import { useCreationDraft } from './draft';
import { FinishStep } from './step-finish';
import { ChooseStep } from './step-choose';
import { PurchaseStep } from './step-purchase';
import { DistributeStep, InputStep, RollStep } from './step-values';
import { panel, TabTitle, type TabNav } from './ui';

/** Onglet final (portrait, récapitulatif, fin) : n'est pas une étape du système. */
const FINISH = '__fin';

const ICONS: Record<EtapeCreation['type'], LucideIcon> = {
  choisir: LayoutGrid,
  repartir: SlidersHorizontal,
  tirer: Dices,
  saisir: PenLine,
  acheter: Sparkles,
};

export function CreationWizard() {
  const { character, system, state, pending, readOnly } = useSheet();
  const roomId = useSearchParams().get('room');
  const server = useVersionedRead('creation', character, pending, getCreationSteps);
  const local = useMemo(() => {
    if (server) return null;
    try {
      return etapesCreation(system, state);
    } catch {
      return [];
    }
  }, [server, system, state]);
  const steps: EtatEtape[] = server ?? local ?? [];
  const draft = useCreationDraft(character.id);
  const tabIds = [...steps.map((s) => s.etape.id), FINISH];

  const [tab, setTab] = useState<string>(() => {
    const saved = draft.draft.tab;
    if (saved && tabIds.includes(saved)) return saved;
    return steps.find((s) => s.statut !== 'faite')?.etape.id ?? FINISH;
  });
  const [enterAt, setEnterAt] = useState<TabNav['enterAt']>('resume');
  const index = Math.max(0, tabIds.indexOf(tab));
  const currentId = tabIds[index]!;
  const currentStep = steps.find((s) => s.etape.id === currentId);

  const goTo = (id: string, at: TabNav['enterAt']) => {
    setEnterAt(at);
    setTab(id);
    draft.setTab(id);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const nav: TabNav = {
    ...(index > 0 ? { onPrev: () => goTo(tabIds[index - 1]!, 'end') } : {}),
    onNext: () => goTo(tabIds[Math.min(index + 1, tabIds.length - 1)]!, 'start'),
    enterAt,
  };

  if (!state.creation)
    return (
      <div className={cn(panel, 'mx-auto max-w-lg space-y-4 p-8 text-center')}>
        <h2 className={cn(titleFont, text, 'text-2xl font-bold')}>Création terminée</h2>
        <p className={cn(textMuted, 'text-sm')}>Ce personnage est prêt à jouer.</p>
        <Link href={afterCreationPath(character.id, roomId)} className={accentButton}>
          {roomId ? 'Rejoindre la table' : 'Voir la fiche'}
        </Link>
      </div>
    );

  if (readOnly)
    return (
      <div className={cn(panel, 'mx-auto max-w-lg p-8 text-center')}>
        <p className={cn(textMuted, 'text-sm')}>
          Seul le propriétaire de ce personnage peut le créer.
        </p>
      </div>
    );

  const tabs = [
    ...steps.map((s) => ({
      id: s.etape.id,
      label: s.etape.nom,
      icon: ICONS[s.etape.type],
      status: s.statut,
    })),
    { id: FINISH, label: 'Portrait', icon: ImageIcon, status: undefined },
  ];

  return (
    <div className="space-y-6">
      <nav aria-label="Étapes de création" className="relative">
        <div className="absolute inset-x-0 bottom-0 h-px bg-[color:var(--fiche-bordure)]" />
        <ol className="relative flex items-stretch justify-between overflow-x-auto [scrollbar-width:thin]">
          {tabs.map((t, i) => {
            const active = t.id === currentId;
            const Icon = t.icon;
            return (
              <li key={t.id} className="flex-1 shrink-0">
                <button
                  type="button"
                  onClick={() => goTo(t.id, 'resume')}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'relative flex h-full w-full min-w-[6.5rem] flex-col items-center gap-2 px-3 pb-3 pt-1 transition-colors',
                    active
                      ? 'text-[color:var(--fiche-accent)]'
                      : 'text-[color:var(--fiche-texte-secondaire)] hover:text-[color:var(--fiche-texte)]',
                    focus,
                  )}
                >
                  <span className="relative">
                    <Icon className={cn('h-6 w-6', active && 'text-[color:var(--fiche-texte)]')} />
                    {t.status === 'faite' && (
                      <Check
                        aria-label="faite"
                        className="absolute -right-2.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-[color:var(--fiche-accent)] p-0.5 text-zinc-950"
                        strokeWidth={3}
                      />
                    )}
                    {t.status === 'invalide' && (
                      <AlertCircle
                        aria-label="à corriger"
                        className="absolute -right-2.5 -top-1.5 h-3.5 w-3.5 text-red-400"
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      'whitespace-nowrap text-[11px] font-bold uppercase tracking-widest',
                      active && 'text-[color:var(--fiche-texte)]',
                    )}
                  >
                    <span className="sr-only">{i + 1}. </span>
                    {t.label}
                  </span>
                  {active && (
                    <motion.span
                      layoutId="creation-onglet-actif"
                      className="absolute inset-x-0 bottom-0 h-[3px] rounded-t-sm bg-[color:var(--fiche-accent)]"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentId}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {currentStep ? (
            <>
              <StepHeader review={currentStep} />
              <StepBody review={currentStep} nav={nav} draft={draft} />
            </>
          ) : (
            <>
              <TabTitle>Portrait et fin de la création</TabTitle>
              <FinishStep
                steps={steps}
                nav={nav}
                draft={draft}
                onGoTo={(id) => goTo(id, 'resume')}
              />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StepHeader({ review }: { review: EtatEtape }) {
  const invalid = review.statut === 'invalide';
  return (
    <div className="space-y-2">
      <TabTitle>{review.etape.nom}</TabTitle>
      {review.etape.description && (
        <p className={cn(textMuted, 'max-w-3xl text-sm leading-relaxed')}>
          {review.etape.description}
        </p>
      )}
      {invalid && review.raisons.length > 0 && (
        <ul
          role="alert"
          className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {review.raisons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StepBody({
  review,
  nav,
  draft,
}: {
  review: EtatEtape;
  nav: TabNav;
  draft: ReturnType<typeof useCreationDraft>;
}) {
  const e = review.etape;
  switch (e.type) {
    case 'choisir':
      return <ChooseStep step={e} nav={nav} draft={draft} />;
    case 'repartir':
      return <DistributeStep step={e} review={review} nav={nav} />;
    case 'tirer':
      return <RollStep step={e} nav={nav} />;
    case 'saisir':
      return <InputStep step={e} nav={nav} />;
    case 'acheter':
      return <PurchaseStep step={e} nav={nav} draft={draft} />;
  }
}
