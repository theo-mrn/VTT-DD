import { describe, expect, it } from 'vitest';
import { fileItem, prettyName } from './background-library';

describe('prettyName', () => {
  it('retire les mots techniques et sépare les mots collés', () => {
    expect(prettyName('Camp_Day_Fog_Audio_NoGrid.webm')).toBe('Camp Day Fog');
    expect(prettyName('CampCanyonDay_Grid.webp')).toBe('Camp Canyon Day');
    expect(prettyName('Low_Lantern_Deck04_NoAudio_Grid.webm')).toBe('Low Lantern Deck04');
    expect(prettyName('Crossroads_Fire_day_grid46x26JPG.jpg')).toBe('Crossroads Fire day');
  });
});

describe('fileItem', () => {
  it('nomme un fichier importé, vignette pour une image, aucune pour une vidéo', () => {
    const image = fileItem('https://example.test/campaigns/c/Ma_Carte_Grid.webp');
    expect(image).toMatchObject({ name: 'Ma Carte', animated: false });
    expect(image.poster).toBe('https://example.test/campaigns/c/Ma_Carte_Grid.webp');
    expect(fileItem('https://example.test/x/Brume%20du%20lac.mp4')).toMatchObject({
      name: 'Brume du lac',
      animated: true,
      poster: null,
    });
  });
});
