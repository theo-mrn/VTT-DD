import type { MapObjectItem } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import {
  addCatalogueItem,
  addFreeItem,
  clampQuantity,
  freeItemError,
  ITEMS_MAX,
  removeItem,
  setItemQuantity,
  totalUnits,
  updateFreeItem,
} from './contents';

const ids = () => {
  let n = 0;
  return () => `c${++n}`;
};

describe('contenu d’un objet à fouiller', () => {
  it('une entrée du marché est référencée par son identifiant et s’empile', () => {
    const make = ids();
    const potion = { id: 'potion-soins', nom: 'Potion de soins' };
    let items = addCatalogueItem([], potion, 1, make);
    expect(items).toEqual([
      { id: 'c1', name: 'Potion de soins', quantity: 1, ref: 'potion-soins' },
    ]);
    items = addCatalogueItem(items, potion, 2, make);
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(3);
    items = addCatalogueItem(items, { id: 'corde', nom: 'Corde' }, 1, make);
    expect(items.map((i) => i.ref)).toEqual(['potion-soins', 'corde']);
  });

  it('un objet libre : nom requis, description facultative, empilé s’il est identique', () => {
    const make = ids();
    expect(freeItemError({ name: '  ', quantity: 1 })).toMatch(/nom/);
    expect(freeItemError({ name: 'Clé', quantity: 0 })).toMatch(/Quantité/);
    expect(addFreeItem([], { name: '', quantity: 1 }, make)).toEqual([]);
    let items = addFreeItem([], { name: ' Clé rouillée ', quantity: 1, description: '' }, make);
    expect(items).toEqual([{ id: 'c1', name: 'Clé rouillée', quantity: 1 }]);
    items = addFreeItem(items, { name: 'Clé rouillée', quantity: 2 }, make);
    expect(items).toEqual([{ id: 'c1', name: 'Clé rouillée', quantity: 3 }]);
    items = addFreeItem(
      items,
      { name: 'Clé rouillée', quantity: 1, description: 'Ouvre la crypte' },
      make,
    );
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ description: 'Ouvre la crypte', quantity: 1 });
    // Un objet du marché du même nom n'est pas confondu avec l'objet libre
    const withRef = addCatalogueItem(items, { id: 'cle', nom: 'Clé rouillée' }, 1, make);
    expect(withRef).toHaveLength(3);
  });

  it('quantités bornées, retrait, renommage d’un objet libre seulement', () => {
    const make = ids();
    let items = addCatalogueItem([], { id: 'fleche', nom: 'Flèche' }, 20, make);
    items = addFreeItem(items, { name: 'Lettre', quantity: 1 }, make);
    expect(setItemQuantity(items, 'c1', 0)[0]!.quantity).toBe(1);
    expect(setItemQuantity(items, 'c1', 2.6)[0]!.quantity).toBe(3);
    expect(clampQuantity(5e9)).toBe(1_000_000);
    expect(totalUnits(items)).toBe(21);
    expect(updateFreeItem(items, 'c1', { name: 'Autre' })[0]!.name).toBe('Flèche');
    const renamed = updateFreeItem(items, 'c2', {
      name: 'Lettre scellée',
      description: 'Cire rouge',
    });
    expect(renamed[1]).toEqual({
      id: 'c2',
      name: 'Lettre scellée',
      quantity: 1,
      description: 'Cire rouge',
    });
    expect(removeItem(items, 'c1').map((i) => i.id)).toEqual(['c2']);
    // Jamais de mutation
    expect(items).toHaveLength(2);
  });

  it('500 contenus au plus (limite du contrat) ; une pile existante grossit encore', () => {
    const make = ids();
    let items: MapObjectItem[] = Array.from({ length: ITEMS_MAX }, (_, i) => ({
      id: `x${i}`,
      name: `Objet ${i}`,
      quantity: 1,
      ref: `e${i}`,
    }));
    expect(addCatalogueItem(items, { id: 'neuf', nom: 'Neuf' }, 1, make)).toHaveLength(ITEMS_MAX);
    expect(addFreeItem(items, { name: 'Libre', quantity: 1 }, make)).toHaveLength(ITEMS_MAX);
    items = addCatalogueItem(items, { id: 'e3', nom: 'Objet 3' }, 4, make);
    expect(items[3]!.quantity).toBe(5);
  });
});
