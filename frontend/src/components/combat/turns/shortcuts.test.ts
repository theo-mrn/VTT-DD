import { describe, expect, it } from 'vitest';
import { combatShortcutOf } from './shortcuts';

describe('raccourcis du panneau Combat', () => {
  it('flèches pour Suivant et Précédent, lettres pour attaquer et tout appliquer', () => {
    expect(combatShortcutOf({ key: 'ArrowRight', code: 'ArrowRight' })).toBe('next');
    expect(combatShortcutOf({ key: 'ArrowLeft', code: 'ArrowLeft' })).toBe('previous');
    // La lettre tapée compte (AZERTY comme QWERTY)
    expect(combatShortcutOf({ key: 'a', code: 'KeyQ' })).toBe('attack');
    expect(combatShortcutOf({ key: 't', code: 'KeyT' })).toBe('applyAll');
  });

  it('jamais en répétition ni avec un modificateur, rien pour les autres touches', () => {
    expect(combatShortcutOf({ key: 'ArrowRight', code: 'ArrowRight', repeat: true })).toBeNull();
    expect(combatShortcutOf({ key: 'a', code: 'KeyA', metaKey: true })).toBeNull();
    expect(combatShortcutOf({ key: 'A', code: 'KeyA', shiftKey: true })).toBeNull();
    expect(combatShortcutOf({ key: 'm', code: 'KeyM' })).toBeNull();
  });
});
