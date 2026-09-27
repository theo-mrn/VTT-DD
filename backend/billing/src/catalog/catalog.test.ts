import { describe, expect, it } from 'vitest';
import { findItem, itemOf, lineName, TOKEN_PREFIX } from './catalog.js';
import { DICE_ITEMS, TOKEN_ITEMS } from './items.js';

describe('catalogue de la boutique', () => {
  it('reprend les prix de l’ancienne app', () => {
    expect(findItem('bismuth')).toMatchObject({ kind: 'dice', price: 500 });
    expect(findItem('ruby')).toMatchObject({
      kind: 'dice',
      price: 250,
      image: 'https://assets.yner.fr/textures/rubis_diffuse.jpg',
    });
    expect(findItem(`${TOKEN_PREFIX}Token3`)).toMatchObject({ kind: 'token', price: 399 });
    expect(itemOf('token', 'Token7')).toMatchObject({ name: 'Cadre Céleste', price: 399 });
    expect(lineName(findItem('ruby')!)).toBe('Dés : Rubis');
    expect(lineName(findItem('token_Token4')!)).toBe('Cadre : Cadre Sanguin');
  });

  it('ne vend pas les articles gratuits ni inconnus', () => {
    for (const id of ['gold', 'silver', 'pierre_donjon', 'steampunk_copper'])
      expect(findItem(id)?.price).toBe(0);
    expect(findItem('token_Token1')?.price).toBe(0);
    expect(findItem('Token3')).toBeUndefined();
    expect(findItem('inconnu')).toBeUndefined();
    expect(findItem('token_')).toBeUndefined();
  });

  it('a des identifiants uniques et des prix entiers en centimes', () => {
    for (const list of [DICE_ITEMS, TOKEN_ITEMS]) {
      expect(new Set(list.map((i) => i.id)).size).toBe(list.length);
      for (const i of list) {
        expect(Number.isInteger(i.price) && i.price >= 0).toBe(true);
        expect(i.id).toMatch(/^[A-Za-z0-9_]{1,64}$/);
      }
    }
    expect(DICE_ITEMS).toHaveLength(71);
  });
});
