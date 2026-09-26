'use client';

/**
 * Assistant de création généré depuis les étapes déclarées par le système
 * (`GET /creation`, sinon `etapesCreation()` en local) : une vue par type
 * d'étape, puis « Terminer la création ».
 */
import { etapesCreation, terminerCreation, type EtapeCreation, type EtatEtape } from '@vtt/rules';
import { AlertCircle, Check, ChevronLeft, ChevronRight, Circle, Flag } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { writes, getCreationSteps, useVersionedRead } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useSheet } from '../context';
import { Block } from '../elements';
import {
  accentButton,
  secondaryButton,
  focus,
  titleFont,
  text,
  textAccent,
  textMuted,
} from '../styles';
import { PurchaseStep } from './step-purchase';
import { ChooseStep } from './step-choose';
import { DistributeStep, InputStep, RollStep } from './value-steps';

export type Step<T extends EtapeCreation['type']> = Extract<EtapeCreation, { type: T }>;

export function CreationAssistant() {
  const { character, system, state, pending, readOnly, write } = useSheet();
  const router = useRouter();
  const server = useVersionedRead('creation', character, pending, getCreationSteps);
  const local = useMemo(
    () => (server ? null : etapesCreation(system, state)),
    [server, system, state],
  );
  const steps: EtatEtape[] = server ?? local ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const firstTodo = steps.findIndex((e) => e.statut !== 'faite');
  const index = Math.max(0, chosen ? steps.findIndex((e) => e.etape.id === chosen) : firstTodo);
  const currentStep = steps[index];
  const remaining = steps.filter((e) => e.statut !== 'faite');

  const goTo = (i: number) => {
    const e = steps[i];
    if (e) {
      setChosen(e.etape.id);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  async function terminer() {
    setDone(true);
    const ok = await write(writes.finish(), (e) => {
      const r = terminerCreation(system, e);
      return r.ok ? r.etat : null;
    });
    setDone(false);
    if (ok) router.push(`/characters/${character.id}`);
  }

  if (!state.creation)
    return (
      <Block title="Création terminée">
        <p className={cn(text, 'mb-3 text-sm')}>Ce personnage est prêt à jouer.</p>
        <Link href={`/characters/${character.id}`} className={accentButton}>
          Voir la fiche
        </Link>
      </Block>
    );

  if (readOnly)
    return (
      <Block title="Création">
        <p className={cn(textMuted, 'text-sm')}>
          Seul le propriétaire de ce personnage peut le créer.
        </p>
      </Block>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Étapes de création" className="lg:sticky lg:top-20 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] lg:flex-col lg:overflow-visible">
          {steps.map((e, i) => (
            <li key={e.etape.id} className="shrink-0">
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === index ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                  i === index
                    ? 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_12%,var(--fiche-carte))]'
                    : 'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] hover:border-[color:var(--fiche-accent)]',
                  focus,
                )}
              >
                <StatusIcon status={e.statut} />
                <span className={cn(text, 'whitespace-nowrap lg:whitespace-normal')}>
                  <span className={textMuted}>{i + 1}.</span> {e.etape.nom}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 space-y-4">
        {currentStep ? (
          <Block title={`${index + 1}. ${currentStep.etape.nom}`}>
            <div className="space-y-4">
              {currentStep.etape.description && (
                <p className={cn(textMuted, 'text-sm leading-relaxed')}>
                  {currentStep.etape.description}
                </p>
              )}
              {currentStep.raisons.length > 0 && (
                <ul
                  className={cn(
                    'space-y-1 rounded-lg border px-3 py-2 text-sm',
                    currentStep.statut === 'invalide'
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)]',
                  )}
                >
                  {currentStep.raisons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              <StepView state={currentStep} onNext={() => goTo(index + 1)} />
            </div>
          </Block>
        ) : (
          <Block title="Création">
            <p className={cn(textMuted, 'text-sm')}>
              Ce système ne déclare pas d&apos;étapes de création pour ce type de fiche.
            </p>
          </Block>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className={secondaryButton}
            onClick={() => goTo(index - 1)}
            disabled={index <= 0}
          >
            <ChevronLeft />
            Précédente
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => goTo(index + 1)}
            disabled={index >= steps.length - 1}
          >
            Suivante
            <ChevronRight />
          </button>
        </div>

        <section
          aria-label="Fin de la création"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] p-4"
        >
          <p className={cn(text, 'text-sm')}>
            {remaining.length ? (
              <>
                {remaining.length} étape{remaining.length > 1 ? 's' : ''} à compléter avant de
                terminer.
              </>
            ) : (
              <span className={cn(titleFont, textAccent)}>Tout est prêt !</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/characters/${character.id}`} className={secondaryButton}>
              Voir la fiche
            </Link>
            <button
              type="button"
              className={accentButton}
              disabled={remaining.length > 0 || done || pending > 0}
              onClick={terminer}
            >
              <Flag />
              Terminer la création
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: EtatEtape['statut'] }) {
  if (status === 'faite')
    return <Check aria-label="faite" className={cn(textAccent, 'h-4 w-4 shrink-0')} />;
  if (status === 'invalide')
    return <AlertCircle aria-label="à corriger" className="h-4 w-4 shrink-0 text-red-400" />;
  return <Circle aria-label="à faire" className={cn(textMuted, 'h-4 w-4 shrink-0')} />;
}

function StepView({ state, onNext }: { state: EtatEtape; onNext(): void }) {
  const { character } = useSheet();
  const e = state.etape;
  // La clé remet la saisie à l'état enregistré après chaque réponse du serveur
  const key = `${e.id}:${character.version}`;
  switch (e.type) {
    case 'choisir':
      return <ChooseStep key={key} step={e} onNext={onNext} />;
    case 'repartir':
      return <DistributeStep key={key} step={e} state={state} onNext={onNext} />;
    case 'tirer':
      return <RollStep key={key} step={e} />;
    case 'saisir':
      return <InputStep key={key} step={e} onNext={onNext} />;
    case 'acheter':
      return <PurchaseStep key={e.id} step={e} />;
  }
}
