import { describe, expect, it } from 'vitest';
import { isVideoUrl, videoVariant } from './background-prefs';

describe('fond vidéo', () => {
  it('variante 1080p des cartes animées de la bibliothèque', () => {
    expect(videoVariant('https://assets.yner.fr/Map/Camp/Animated/Camp_Day.webm')).toBe(
      'https://assets.yner.fr/Map/Camp/Animated/1080p/Camp_Day.mp4',
    );
    expect(
      videoVariant('https://pub-6b6ff93daa684afe8aca1537c143add0.r2.dev/Map/Pont/Animated/B.webm'),
    ).toBe('https://pub-6b6ff93daa684afe8aca1537c143add0.r2.dev/Map/Pont/Animated/1080p/B.mp4');
  });

  it('rien hors bibliothèque ou hors cartes', () => {
    expect(videoVariant('http://localhost:8333/vtt-dev/campaigns/x/fond.webm')).toBeNull();
    expect(videoVariant('https://assets.yner.fr/Effect/Fire/feu.webm')).toBeNull();
    expect(videoVariant('https://assets.yner.fr/Map/Camp/camp.jpg')).toBeNull();
  });

  it('reconnaît une vidéo', () => {
    expect(isVideoUrl('https://x/y.webm?v=1')).toBe(true);
    expect(isVideoUrl('https://x/y.webp')).toBe(false);
  });
});
