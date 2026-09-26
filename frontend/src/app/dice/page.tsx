'use client';

/**
 * Jets personnels, hors campagne : le panneau de dés de l'ancienne app avec
 * les dés du système choisi. Les jets sont tirés par le service des dés et
 * visibles par leur seul auteur.
 */
import { useEffect, useState } from 'react';
import { Loading, Message, PageTitle } from '@/components/account/elements';
import { AccountNav } from '@/components/account/account-nav';
import { DiceRoller } from '@/components/dice-roller';
import { errorMessage } from '@/lib/api';
import {
  loadRollSystem,
  listRollSystems,
  type SystemSummary,
  type PlayableSystem,
} from '@/lib/rolls';
import { useRequiredProfile } from '@/lib/session';
import { cn } from '@/lib/utils';

export default function DicePage() {
  const profile = useRequiredProfile();
  const [systems, setSystems] = useState<SystemSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [playable, setPlayable] = useState<PlayableSystem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    listRollSystems()
      .then((list) => {
        setSystems(list);
        if (list[0]) setSelected(list[0].id);
      })
      .catch((e) => {
        setSystems([]);
        setError(errorMessage(e));
      });
  }, [profile]);

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

  if (!profile) return <Loading />;

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-200">
      <AccountNav />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        <PageTitle subtitle="Dés du système choisi, ou formule libre. Vos jets personnels ne sont visibles que par vous.">
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
          <DiceRoller inline system={playable.system} presentation={playable.presentation} />
        ) : null}
      </main>
    </div>
  );
}
