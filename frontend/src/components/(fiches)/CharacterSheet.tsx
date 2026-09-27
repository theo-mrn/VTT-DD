'use client';

/**
 * Fiche d'un personnage ouverte depuis la carte (menu du token, bouton de la
 * barre du haut). L'ancienne fiche Firestore est remplacée par la fiche du
 * nouveau front (service character) : même composant que la page de jeu.
 */
import { X } from 'lucide-react';
import { CharacterPage } from '@/components/sheet/character-page';
import { CharacterSheet as Sheet } from '@/components/sheet/sheet';
import { useGame } from '@/contexts/GameContext';

export default function CharacterSheet({
  characterId,
  onClose,
}: {
  characterId: string;
  roomId: string;
  onClose(): void;
}) {
  const { isMJ } = useGame();
  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative mx-auto max-w-6xl rounded-2xl border border-[var(--border-color)] bg-[var(--bg-dark)] p-3 shadow-2xl sm:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-lg p-2 text-[var(--text-secondary)] hover:bg-white/10 hover:text-[var(--text-primary)]"
          aria-label="Fermer la fiche"
        >
          <X className="h-5 w-5" />
        </button>
        <CharacterPage id={characterId} gm={isMJ}>
          <Sheet />
        </CharacterPage>
      </div>
    </div>
  );
}
