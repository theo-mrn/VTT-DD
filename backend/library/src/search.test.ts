import { describe, expect, it } from 'vitest';
import { searchForm, searchTerms, searchTexts } from './search.js';

describe('recherche', () => {
  it('ramène accents, ligatures et majuscules à une seule forme', () => {
    expect(searchForm('Église Œuvre Château')).toBe('eglise oeuvre chateau');
  });

  it('découpe une requête en termes sans doublon ni ponctuation', () => {
    expect(searchTerms('Grotte, illuminée ! grotte')).toEqual(['grotte', 'illuminee']);
    expect(searchTerms("'):* & | !")).toEqual([]);
  });

  it('ignore les mots vides, sauf si la requête n’a que ça', () => {
    expect(searchTerms(`l'intérieur d'un château`)).toEqual(['interieur', 'chateau']);
    expect(searchTerms('the inside of a castle')).toEqual(['inside', 'castle']);
    expect(searchTerms('le la')).toEqual(['le', 'la']);
  });

  it('garde au plus 8 termes', () => {
    expect(searchTerms('a b c d e f g h i j')).toHaveLength(8);
  });

  it('met titre, mots-clés et collection en tête, la description dans le corps', () => {
    expect(
      searchTexts({
        title: 'Grotte aux cristaux',
        keywords: ['caverne', 'lumière'],
        description: 'Une grotte éclairée.',
        collection: 'Dark Mountains',
      }),
    ).toEqual({
      head: 'grotte aux cristaux caverne lumiere dark mountains',
      body: 'une grotte eclairee.',
    });
  });
});
