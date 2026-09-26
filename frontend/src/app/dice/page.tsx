'use client';

/**
 * Démonstration du lanceur de dés : un système choisi parmi ceux du service
 * character (routes publiques), sans personnage. Les jets sont tirés
 * localement par le moteur de règles.
 */
import { useEffect, useState } from 'react';
import { Card, Loading, Switch, Message, PageTitle } from '@/components/account/elements';
import { LanceurDes } from '@/components/(dices)';
import { errorMessage } from '@/lib/api';
import {
  loadRollSystem,
  listRollSystems,
  type SystemSummary,
  type PlayableSystem,
} from '@/lib/rolls';
import { cn } from '@/lib/utils';

export default function DicePage() {
  const [systems, setSystems] = useState<SystemSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [playable, setPlayable] = useState<PlayableSystem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animation3d, setAnimation3d] = useState(false);

  useEffect(() => {
    listRollSystems()
      .then((list) => {
        setSystems(list);
        if (list[0]) setSelected(list[0].id);
      })
      .catch((e) => {
        setSystems([]);
        setError(errorMessage(e));
      });
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadRollSystem(selected)
      .then((s) => !cancelled && setPlayable(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : errorMessage(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-200">
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        <PageTitle subtitle="Dés du système choisi, ou formule libre. Les jets restent dans ce navigateur.">
          Lanceur de dés
        </PageTitle>

        {systems === null ? (
          <Loading text="Chargement des systèmes…" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Système de jeu">
              {systems.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={selected === s.id}
                  onClick={() => setSelected(s.id)}
                  title={s.description}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                    selected === s.id
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
              <Switch
                active={animation3d}
                onChange={setAnimation3d}
                label="Animation 3D"
                description="Dés physiques à l’écran (plus gourmand)."
              />
            </div>
          </div>
        )}

        {error && <Message>{error}</Message>}
        {playable && playable.presentationErrors.length > 0 && (
          <Message tone="info">
            Présentation du système ignorée : {playable.presentationErrors.slice(0, 2).join(' ; ')}
          </Message>
        )}

        {loading && !playable ? (
          <Loading text="Chargement du système…" />
        ) : playable ? (
          <Card
            title={playable.system.source.nom}
            description={
              playable.system.source.des
                ? 'Clic sur un dé pour l’ajouter, clic droit pour le retirer.'
                : 'Notation : 2d6 + 3, 4d6k3, 2d20kl1, 1d6!'
            }
          >
            <LanceurDes
              system={playable.system}
              presentation={playable.presentation}
              animation3d={animation3d}
            />
          </Card>
        ) : null}
      </main>
    </div>
  );
}
