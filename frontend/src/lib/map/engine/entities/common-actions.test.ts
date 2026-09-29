/**
 * Menu « Disposition » : devant ou derrière dans son calque, puis le calque (l'étage), en un
 * seul sous-menu, avec des titres de section.
 */
import { describe, expect, it } from 'vitest';
import { box, setup } from '../test-kit';

const layer = (id: string, name: string, sortOrder: number) => ({
  id,
  version: 1,
  name,
  sortOrder,
  visibleToPlayers: true,
  locked: false,
  opacity: 1,
});

describe('menu Disposition', () => {
  it('ordre dans le calque, puis la liste des calques du plus haut au plus bas', () => {
    const t = setup({
      boxes: [box('a', 100, 100, { layerId: 'objets' })],
      layers: [
        layer('sol', 'Sol', 0),
        layer('objets', 'Objets', 1),
        layer('persos', 'Personnages', 2),
      ],
    });
    const arrange = t.engine.menuItems(['a'], { x: 100, y: 100 }).find((i) => i.id === 'arrange');
    expect(arrange?.label).toBe('Disposition');
    const children = arrange!.children!;
    expect(children.map((i) => i.id)).toEqual([
      'label:arrange-order',
      'arrange:front',
      'arrange:forward',
      'arrange:backward',
      'arrange:back',
      'sep:arrange-layers',
      'label:arrange-layers',
      'arrange:layer:persos',
      'arrange:layer:objets',
      'arrange:layer:sol',
    ]);
    expect(children[0]!.label).toBe('Devant ou derrière, dans « Objets »');
    expect(children.find((i) => i.id === 'arrange:layer:objets')?.checked).toBe(true);
    expect(children.find((i) => i.id === 'arrange:layer:sol')?.checked).toBe(false);
  });
});
