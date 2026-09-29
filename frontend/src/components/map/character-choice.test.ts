/**
 * « Visible pour… » : un seul composant pour les objets et les tokens, nourri par l'annuaire du
 * moteur (personnages du camp des joueurs), comme les menus.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { setup } from '@/lib/map/engine/test-kit';
import { CharacterChoice, type CharacterChoiceProps } from './character-choice';
import { MapEngineProvider } from './engine-context';

function render(props: CharacterChoiceProps, characters = [{ id: 'aldric', name: 'Aldric' }]) {
  const t = setup({ directory: { characters: () => characters, userName: () => null } });
  return renderToStaticMarkup(
    createElement(MapEngineProvider, { value: t.engine }, createElement(CharacterChoice, props)),
  );
}

describe('CharacterChoice', () => {
  it('une pastille par personnage de l’annuaire, pressée si choisi', () => {
    const html = render(
      { label: 'Visible pour', isChosen: (id) => id === 'aldric', onToggle: () => undefined },
      [
        { id: 'aldric', name: 'Aldric' },
        { id: 'brune', name: 'Brune' },
      ],
    );
    expect(html).toContain('aria-label="Visible pour"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Aldric</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Brune</);
    expect(html).not.toContain('Tous les joueurs');
  });

  it('« Tous les joueurs » en tête pour un objet ; annuaire vide : message', () => {
    const html = render({
      label: 'Visible pour',
      isChosen: () => false,
      onToggle: () => undefined,
      all: { checked: true, onSelect: () => undefined },
    });
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tous les joueurs</);
    expect(render({ label: 'x', isChosen: () => false, onToggle: () => undefined }, [])).toContain(
      'Aucun personnage joueur',
    );
  });
});
