import { describe, expect, it } from 'vitest';
import type { Asset } from '@/lib/assets';
import { groupBackgrounds, prettyName } from './background-library';

const asset = (category: string, name: string, type: Asset['type'] = 'image'): Asset =>
  ({ category, name, type, path: `/lib/${category}/${name}` }) as Asset;

describe('prettyName', () => {
  it('retire les mots techniques et sépare les mots collés', () => {
    expect(prettyName('Camp_Day_Fog_Audio_NoGrid.webm')).toBe('Camp Day Fog');
    expect(prettyName('CampCanyonDay_Grid.webp')).toBe('Camp Canyon Day');
    expect(prettyName('Low_Lantern_Deck04_NoAudio_Grid.webm')).toBe('Low Lantern Deck04');
    expect(prettyName('Crossroads_Fire_day_grid46x26JPG.jpg')).toBe('Crossroads Fire day');
  });
});

describe('groupBackgrounds', () => {
  it('regroupe formats et grille, la version sans grille par défaut', () => {
    const items = groupBackgrounds([
      asset('Map/Foret/Static', 'Crossroads_Fire_day.png'),
      asset('Map/Foret/Static', 'Crossroads_Fire_dayJPG.jpg'),
      asset('Map/Foret/Static', 'Crossroads_Fire_day_grid46x26.png'),
      asset('Map/Foret/Static', 'Crossroads_Fire_day_grid46x26JPG.jpg'),
      asset('Map/Foret/Static', 'Crossroads_Fire_night.png'),
    ]);
    expect(items).toHaveLength(2);
    const day = items.find((i) => i.name === 'Crossroads Fire day')!;
    expect(day.url).toMatch(/Crossroads_Fire_dayJPG\.jpg$/);
    expect(day.gridUrl).toMatch(/Crossroads_Fire_day_grid46x26JPG\.jpg$/);
    expect(day.urls).toHaveLength(4);
    expect(items.find((i) => i.name === 'Crossroads Fire night')!.gridUrl).toBeNull();
  });

  it('sépare dossiers, animations et illustrations', () => {
    const items = groupBackgrounds([
      asset('Map/Camp/Static', 'CampForest.webp'),
      asset('Map/Camp/Animated', 'CampForest_NoGrid_Audio.webm', 'video'),
      asset('Map/Camp/Illustrations', 'CampForest.webp'),
      asset('Map/Foret/Static', 'CampForest.webp'),
      asset('Portraits/Elfe', 'elfe.webp'),
    ]);
    expect(items).toHaveLength(4);
    expect(items.filter((i) => i.animated)).toHaveLength(1);
    expect(items.filter((i) => i.illustration)).toHaveLength(1);
  });

  it('garde une carte qui n’existe qu’avec grille', () => {
    const [item] = groupBackgrounds([asset('Map/Cave/Static', 'Cave01_Grid.webp')]);
    expect(item!.url).toMatch(/Cave01_Grid\.webp$/);
    expect(item!.gridUrl).toBeNull();
  });
});
