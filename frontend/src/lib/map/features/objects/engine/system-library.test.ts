/**
 * Bibliothèque d'objets du système : catégories déclarées, noms lisibles, ordre naturel.
 */
import { describe, expect, it } from 'vitest';
import { objectName, systemObjects } from './system-library';

const asset = (category: string, name: string, type = 'image') => ({
  name,
  path: `https://cdn.test/${category}/${name}`,
  category,
  type,
});

describe('bibliothèque d’objets du système', () => {
  it('noms lisibles tirés du fichier', () => {
    expect(objectName('escalier1.png')).toBe('Escalier 1');
    expect(objectName('coffre_bois-2.webp')).toBe('Coffre bois 2');
    expect(objectName('.png')).toBe('Objet');
  });

  it('objets des dossiers déclarés, par catégorie puis par nom, sans doublon ni vidéo', () => {
    const assets = [
      asset('items/chest', 'chest10.png'),
      asset('items/chest', 'chest2.png'),
      asset('objets/fourniture', 'table1.png'),
      asset('objets/fourniture/sub', 'chaise1.png'),
      asset('Map/Foret', 'foret.png'),
      asset('items/chest', 'anim.webm', 'video'),
    ];
    const list = systemObjects(assets, [
      { titre: 'Mobilier', dossiers: ['objets/fourniture'] },
      { titre: 'Conteneurs', dossiers: ['items/chest', 'objets/fourniture'] },
    ]);
    expect(list.map((o) => `${o.category}:${o.name}`)).toEqual([
      'Mobilier:Chaise 1',
      'Mobilier:Table 1',
      'Conteneurs:Chest 2',
      'Conteneurs:Chest 10',
    ]);
    expect(list[0]!.key).toBe('system:https://cdn.test/objets/fourniture/sub/chaise1.png');
  });
});
