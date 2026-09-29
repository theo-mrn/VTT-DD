'use client';

/**
 * Choix de personnages joueurs (« Visible pour… ») : une pastille par personnage, commune aux
 * inspecteurs des objets et des tokens. La liste est celle de l'annuaire du moteur
 * (`engine.directory.characters()` : personnages du camp des joueurs), la même que celle des
 * menus « Visible pour… » et « Pour certains joueurs ».
 */
import { useMapEngine } from './engine-context';
import { cn } from '@/lib/utils';

export interface CharacterChoiceProps {
  /** Nom du groupe pour les lecteurs d'écran. */
  label: string;
  isChosen(characterId: string): boolean;
  onToggle(characterId: string): void;
  /** Pastille « Tous les joueurs » en tête (objets) ; absente : la liste seule (tokens). */
  all?: { checked: boolean; onSelect(): void };
  disabled?: boolean;
}

const chip = (pressed: boolean) =>
  cn(
    'h-7 rounded-full border px-2.5 text-xs transition-colors disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
    pressed
      ? 'border-primary/50 bg-primary/15 text-primary-strong'
      : 'border-border-strong text-muted-foreground hover:text-foreground',
  );

export function CharacterChoice({
  label,
  isChosen,
  onToggle,
  all,
  disabled,
}: CharacterChoiceProps) {
  const engine = useMapEngine();
  const characters = engine.directory.characters();
  if (!characters.length)
    return (
      <p className="text-xs text-muted-foreground">Aucun personnage joueur dans la campagne.</p>
    );
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {all && (
        <button
          type="button"
          aria-pressed={all.checked}
          disabled={disabled}
          className={chip(all.checked)}
          onClick={all.onSelect}
        >
          Tous les joueurs
        </button>
      )}
      {characters.map((c) => {
        const on = isChosen(c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            className={chip(on)}
            onClick={() => onToggle(c.id)}
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
