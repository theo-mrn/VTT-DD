import { describe, expect, it } from 'vitest';
import { cleanAnswer, estimatedCost } from './describe.js';

describe('description', () => {
  it('nettoie la réponse du modèle : espaces, point final, doublons de mots-clés', () => {
    const d = cleanAnswer({
      title_fr: '  Grotte aux  cristaux. ',
      title_en: 'Crystal cave',
      description_fr: ' Une grotte   éclairée par des cristaux. ',
      description_en: 'A cave lit by crystals.',
      keywords_fr: ['Grotte', 'grotte', ' caverne ', ''],
      keywords_en: ['cave', 'Cave'],
      place: 'cave',
      setting: 'underground',
      time_of_day: 'unknown',
      moods: ['magical', 'magical', 'mysterious', 'eerie', 'grim'],
    });
    expect(d).toEqual({
      titleFr: 'Grotte aux cristaux',
      titleEn: 'Crystal cave',
      descriptionFr: 'Une grotte éclairée par des cristaux.',
      descriptionEn: 'A cave lit by crystals.',
      keywordsFr: ['grotte', 'caverne'],
      keywordsEn: ['cave'],
      place: 'cave',
      setting: 'underground',
      timeOfDay: 'unknown',
      moods: ['magical', 'mysterious', 'eerie'],
    });
  });

  it('estime le coût d’un appel pour un modèle connu', () => {
    expect(
      estimatedCost({ model: 'claude-opus-5-5', inputTokens: 1_000_000, outputTokens: 100_000 }),
    ).toBe(6);
    expect(estimatedCost({ model: 'modele-inconnu', inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
});
