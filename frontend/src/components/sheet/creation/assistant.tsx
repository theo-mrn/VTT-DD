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
import { ecritures, lireEtapesCreation, useLectureVersionnee } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useFiche } from '../context';
import { Bloc } from '../elements';
import {
  boutonAccent,
  boutonSecondaire,
  focus,
  policeTitres,
  texte,
  texteAccent,
  texteSecondaire,
} from '../styles';
import { EtapeAcheter } from './step-purchase';
import { EtapeChoisir } from './step-choose';
import { EtapeRepartir, EtapeSaisir, EtapeTirer } from './value-steps';

export type Etape<T extends EtapeCreation['type']> = Extract<EtapeCreation, { type: T }>;

export function AssistantCreation() {
  const { personnage, systeme, etat, enAttente, lectureSeule, ecrire } = useFiche();
  const router = useRouter();
  const serveur = useLectureVersionnee('creation', personnage, enAttente, lireEtapesCreation);
  const local = useMemo(
    () => (serveur ? null : etapesCreation(systeme, etat)),
    [serveur, systeme, etat],
  );
  const etapes: EtatEtape[] = serveur ?? local ?? [];
  const [choisie, setChoisie] = useState<string | null>(null);
  const [fin, setFin] = useState(false);

  const premiereAFaire = etapes.findIndex((e) => e.statut !== 'faite');
  const index = Math.max(
    0,
    choisie ? etapes.findIndex((e) => e.etape.id === choisie) : premiereAFaire,
  );
  const courante = etapes[index];
  const restantes = etapes.filter((e) => e.statut !== 'faite');

  const aller = (i: number) => {
    const e = etapes[i];
    if (e) {
      setChoisie(e.etape.id);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  async function terminer() {
    setFin(true);
    const ok = await ecrire(ecritures.terminer(), (e) => {
      const r = terminerCreation(systeme, e);
      return r.ok ? r.etat : null;
    });
    setFin(false);
    if (ok) router.push(`/characters/${personnage.id}`);
  }

  if (!etat.creation)
    return (
      <Bloc titre="Création terminée">
        <p className={cn(texte, 'mb-3 text-sm')}>Ce personnage est prêt à jouer.</p>
        <Link href={`/characters/${personnage.id}`} className={boutonAccent}>
          Voir la fiche
        </Link>
      </Bloc>
    );

  if (lectureSeule)
    return (
      <Bloc titre="Création">
        <p className={cn(texteSecondaire, 'text-sm')}>
          Seul le propriétaire de ce personnage peut le créer.
        </p>
      </Bloc>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="Étapes de création" className="lg:sticky lg:top-20 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] lg:flex-col lg:overflow-visible">
          {etapes.map((e, i) => (
            <li key={e.etape.id} className="shrink-0">
              <button
                type="button"
                onClick={() => aller(i)}
                aria-current={i === index ? 'step' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                  i === index
                    ? 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_12%,var(--fiche-carte))]'
                    : 'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] hover:border-[color:var(--fiche-accent)]',
                  focus,
                )}
              >
                <IconeStatut statut={e.statut} />
                <span className={cn(texte, 'whitespace-nowrap lg:whitespace-normal')}>
                  <span className={texteSecondaire}>{i + 1}.</span> {e.etape.nom}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 space-y-4">
        {courante ? (
          <Bloc titre={`${index + 1}. ${courante.etape.nom}`}>
            <div className="space-y-4">
              {courante.etape.description && (
                <p className={cn(texteSecondaire, 'text-sm leading-relaxed')}>
                  {courante.etape.description}
                </p>
              )}
              {courante.raisons.length > 0 && (
                <ul
                  className={cn(
                    'space-y-1 rounded-lg border px-3 py-2 text-sm',
                    courante.statut === 'invalide'
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)]',
                  )}
                >
                  {courante.raisons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              <VueEtape etat={courante} onSuivante={() => aller(index + 1)} />
            </div>
          </Bloc>
        ) : (
          <Bloc titre="Création">
            <p className={cn(texteSecondaire, 'text-sm')}>
              Ce système ne déclare pas d&apos;étapes de création pour ce type de fiche.
            </p>
          </Bloc>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className={boutonSecondaire}
            onClick={() => aller(index - 1)}
            disabled={index <= 0}
          >
            <ChevronLeft />
            Précédente
          </button>
          <button
            type="button"
            className={boutonSecondaire}
            onClick={() => aller(index + 1)}
            disabled={index >= etapes.length - 1}
          >
            Suivante
            <ChevronRight />
          </button>
        </div>

        <section
          aria-label="Fin de la création"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] p-4"
        >
          <p className={cn(texte, 'text-sm')}>
            {restantes.length ? (
              <>
                {restantes.length} étape{restantes.length > 1 ? 's' : ''} à compléter avant de
                terminer.
              </>
            ) : (
              <span className={cn(policeTitres, texteAccent)}>Tout est prêt !</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/characters/${personnage.id}`} className={boutonSecondaire}>
              Voir la fiche
            </Link>
            <button
              type="button"
              className={boutonAccent}
              disabled={restantes.length > 0 || fin || enAttente > 0}
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

function IconeStatut({ statut }: { statut: EtatEtape['statut'] }) {
  if (statut === 'faite')
    return <Check aria-label="faite" className={cn(texteAccent, 'h-4 w-4 shrink-0')} />;
  if (statut === 'invalide')
    return <AlertCircle aria-label="à corriger" className="h-4 w-4 shrink-0 text-red-400" />;
  return <Circle aria-label="à faire" className={cn(texteSecondaire, 'h-4 w-4 shrink-0')} />;
}

function VueEtape({ etat, onSuivante }: { etat: EtatEtape; onSuivante(): void }) {
  const { personnage } = useFiche();
  const e = etat.etape;
  // La clé remet la saisie à l'état enregistré après chaque réponse du serveur
  const cle = `${e.id}:${personnage.version}`;
  switch (e.type) {
    case 'choisir':
      return <EtapeChoisir key={cle} etape={e} onSuivante={onSuivante} />;
    case 'repartir':
      return <EtapeRepartir key={cle} etape={e} etat={etat} onSuivante={onSuivante} />;
    case 'tirer':
      return <EtapeTirer key={cle} etape={e} />;
    case 'saisir':
      return <EtapeSaisir key={cle} etape={e} onSuivante={onSuivante} />;
    case 'acheter':
      return <EtapeAcheter key={e.id} etape={e} />;
  }
}
