import { IconeEtat, type Presentation } from '@vtt/rules';
import { Sparkles } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { lucideSvg, STATE_ICONS, stateIconOf, stateIconsOf } from './state-icons';

describe('icônes des états', () => {
  it('chaque icône que la présentation peut choisir a son dessin, jamais l’étincelle', () => {
    expect(Object.keys(STATE_ICONS).sort()).toEqual([...IconeEtat.options].sort());
    expect(Object.values(STATE_ICONS)).not.toContain(Sparkles);
    // Deux états différents ne partagent pas un dessin
    expect(new Set(Object.values(STATE_ICONS)).size).toBe(IconeEtat.options.length);
  });

  it('icône de l’entrée déclarée par la présentation, sinon l’icône générique', () => {
    const presentation = {
      combat: {
        groupes: [],
        etats: { sortes: ['etat'], icones: { aveugle: 'aveugle', empoisonne: 'poison' } },
      },
    } as unknown as Presentation;
    const icons = stateIconsOf(presentation);
    expect(stateIconOf(icons, 'empoisonne')).toBe('poison');
    expect(stateIconOf(icons, 'charme')).toBe('etat');
    expect(stateIconOf(icons, null)).toBe('etat');
    expect(stateIconsOf(null)).toEqual({});
  });

  it('dessin SVG d’une icône lucide pour la carte (traits blancs, à teinter)', () => {
    for (const icon of Object.values(STATE_ICONS)) {
      const svg = lucideSvg(icon);
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"[^>]*stroke="white"/);
      expect(svg).toMatch(/<(path|circle|line|polyline|polygon|rect|ellipse) /);
      expect(svg).not.toContain('key=');
    }
    expect(lucideSvg(STATE_ICONS.aveugle)).toContain('<path d="');
  });
});
