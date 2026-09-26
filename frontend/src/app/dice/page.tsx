'use client';

/**
 * Démonstration du lanceur de dés : un système choisi parmi ceux du service
 * character (routes publiques), sans personnage. Les jets sont tirés
 * localement par le moteur de règles.
 */
import { useEffect, useState } from 'react';
import { Carte, Chargement, Interrupteur, Message, TitrePage } from '@/components/account/elements';
import { LanceurDes } from '@/components/(dices)';
import { messageErreur } from '@/lib/api';
import {
  chargerSystemeJets,
  listerSystemesJets,
  type ResumeSysteme,
  type SystemeJouable,
} from '@/lib/rolls';
import { cn } from '@/lib/utils';

export default function PageDes() {
  const [systemes, setSystemes] = useState<ResumeSysteme[] | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [jouable, setJouable] = useState<SystemeJouable | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [animation3d, setAnimation3d] = useState(false);

  useEffect(() => {
    listerSystemesJets()
      .then((liste) => {
        setSystemes(liste);
        if (liste[0]) setChoisi(liste[0].id);
      })
      .catch((e) => {
        setSystemes([]);
        setErreur(messageErreur(e));
      });
  }, []);

  useEffect(() => {
    if (!choisi) return;
    let annule = false;
    setChargement(true);
    setErreur(null);
    chargerSystemeJets(choisi)
      .then((s) => !annule && setJouable(s))
      .catch((e) => !annule && setErreur(e instanceof Error ? e.message : messageErreur(e)))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [choisi]);

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-200">
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        <TitrePage sousTitre="Dés du système choisi, ou formule libre. Les jets restent dans ce navigateur.">
          Lanceur de dés
        </TitrePage>

        {systemes === null ? (
          <Chargement texte="Chargement des systèmes…" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Système de jeu">
              {systemes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={choisi === s.id}
                  onClick={() => setChoisi(s.id)}
                  title={s.description}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    choisi === s.id
                      ? 'border-[#c9a965] bg-[#c9a965]/10 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-white',
                  )}
                >
                  {s.nom}
                  <span className="ml-1.5 text-xs text-zinc-500">v{s.version}</span>
                </button>
              ))}
            </div>
            <div className="w-full sm:w-64">
              <Interrupteur
                actif={animation3d}
                onChange={setAnimation3d}
                label="Animation 3D"
                description="Dés physiques à l’écran (plus gourmand)."
              />
            </div>
          </div>
        )}

        {erreur && <Message>{erreur}</Message>}
        {jouable && jouable.erreursPresentation.length > 0 && (
          <Message ton="info">
            Présentation du système ignorée : {jouable.erreursPresentation.slice(0, 2).join(' ; ')}
          </Message>
        )}

        {chargement && !jouable ? (
          <Chargement texte="Chargement du système…" />
        ) : jouable ? (
          <Carte
            titre={jouable.systeme.source.nom}
            description={
              jouable.systeme.source.des
                ? 'Clic sur un dé pour l’ajouter, clic droit pour le retirer.'
                : 'Notation : 2d6 + 3, 4d6k3, 2d20kl1, 1d6!'
            }
          >
            <LanceurDes
              systeme={jouable.systeme}
              presentation={jouable.presentation}
              animation3d={animation3d}
            />
          </Carte>
        ) : null}
      </main>
    </div>
  );
}
