import { describe, expect, it } from 'vitest';
import { EMOJI_KEYWORDS } from './emoji-keywords';
import { searchEmoji } from './emoji-search';

describe('recherche d’emoji', () => {
  it('trouve en français, sans accents ni majuscules, par début de mot', () => {
    expect(searchEmoji(EMOJI_KEYWORDS, 'papillon')[0]).toBe('🦋');
    expect(searchEmoji(EMOJI_KEYWORDS, 'Épée')).toContain('⚔️');
    expect(searchEmoji(EMOJI_KEYWORDS, 'dague')).toContain('🗡️');
    expect(searchEmoji(EMOJI_KEYWORDS, 'sorc')).toContain('🧙');
    expect(searchEmoji(EMOJI_KEYWORDS, 'biere')).toContain('🍺');
  });

  it('plusieurs mots : tous doivent correspondre ; rien pour une recherche vide', () => {
    const r = searchEmoji(EMOJI_KEYWORDS, 'rire larmes');
    expect(r).toContain('😂');
    expect(r.every((e) => EMOJI_KEYWORDS[e]!.includes('larmes'))).toBe(true);
    expect(searchEmoji(EMOJI_KEYWORDS, '  ')).toEqual([]);
    expect(searchEmoji(EMOJI_KEYWORDS, 'zzqqxx')).toEqual([]);
  });
});
