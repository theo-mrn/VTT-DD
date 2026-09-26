'use client';

/**
 * Chargement commun aux pages d'un personnage (fiche, création) : personnage,
 * système et présentation, puis le contexte de fiche. Affiche le chargement
 * et les erreurs comme les écrans de compte.
 */
import type { ReactNode } from 'react';
import { AppButton, Loading, Message } from '@/components/account/elements';
import { useCharacter } from '@/lib/characters';
import { useProfile } from '@/lib/session';
import { useSystem } from '@/lib/systems';
import { SheetProvider } from './context';
import { WriteError } from './header';

export function CharacterPage({
  id,
  gm = false,
  children,
}: {
  id: string;
  /**
   * L'utilisateur mène la campagne d'où la fiche est ouverte (`?campaign=`, table de
   * jeu) : il saisit les attributs `saisie: mj`.
   */
  gm?: boolean;
  children: ReactNode;
}) {
  const profile = useProfile();
  const tracker = useCharacter(id);
  const { personnage: character } = tracker;
  const ready = useSystem(character?.etat.systeme.id ?? null);

  if (tracker.loadError && !character)
    return <PageError message={tracker.loadError} onRetry={tracker.reload} />;
  if (!character) return <Loading text="Chargement du personnage…" />;
  if (ready.error && !ready.data) return <PageError message={ready.error} onRetry={ready.reload} />;
  if (!ready.data) return <Loading text="Chargement des règles…" />;

  return (
    <SheetProvider
      tracker={tracker}
      ready={ready.data}
      readOnly={character.ownerId !== profile.id}
      gm={gm}
      fallback={
        <Message>
          Ce personnage ne se calcule pas avec la version actuelle de son système (type «&nbsp;
          {character.etat.type}&nbsp;» inconnu).
        </Message>
      }
    >
      {children}
      <WriteError error={tracker.error} onClose={tracker.clearError} />
    </SheetProvider>
  );
}

function PageError({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-10">
      <Message>{message}</Message>
      <AppButton tone="secondaire" onClick={onRetry}>
        Réessayer
      </AppButton>
    </div>
  );
}
