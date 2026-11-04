import { describe, expect, it } from 'vitest';
import { dndBackdropEntries, mapPackEntries, provisionalTitle } from './sources.js';

const U1 = '133a9550-66a6-4168-890f-2b69545c2b61';
const U2 = 'ceeca87c-7142-4d42-af76-245cbc32fc2c';

describe('source dndbackdrop', () => {
  it('regroupe les variantes d’un même prompt en un lieu, dans l’ordre', () => {
    const { entries, skipped } = dndBackdropEntries([
      `boldbrushstudio_Kings_Old_Fort_A_derelict_clock_tower_that_on_${U1}_2.png`,
      `boldbrushstudio_Kings_Old_Fort_A_derelict_clock_tower_that_on_${U1}_0.png`,
      `boldbrushstudio_Dark_Mountains_Hidden_subterranean_crystal_ca_${U2}_1.png`,
      '.DS_Store',
      'notes.txt',
    ]);
    expect(skipped).toEqual(['notes.txt']);
    expect(entries).toEqual([
      {
        sourceKey: U2,
        collection: 'Dark Mountains',
        hint: 'Hidden subterranean crystal ca',
        images: [
          {
            file: `boldbrushstudio_Dark_Mountains_Hidden_subterranean_crystal_ca_${U2}_1.png`,
            id: `${U2}-1`,
            position: 1,
          },
        ],
      },
      {
        sourceKey: U1,
        collection: 'Kings Old Fort',
        hint: 'A derelict clock tower that on',
        images: [
          {
            file: `boldbrushstudio_Kings_Old_Fort_A_derelict_clock_tower_that_on_${U1}_0.png`,
            id: `${U1}-0`,
            position: 0,
          },
          {
            file: `boldbrushstudio_Kings_Old_Fort_A_derelict_clock_tower_that_on_${U1}_2.png`,
            id: `${U1}-2`,
            position: 2,
          },
        ],
      },
    ]);
  });

  it('lit les autres auteurs et les sous-dossiers nommés, une variante absente, sans doublon', () => {
    const U3 = 'db542e7f-5891-4e90-9fc7-8c91f527da96';
    const U4 = '040cf1c3-5e3a-420c-8140-c0d4bb26060b';
    const { entries } = dndBackdropEntries([
      `may/Haunted/cspreeti_A_calm_clear_day_with_deep_blue_skies_${U3}_0.png`,
      `001/DndBackdrop Images/may/Haunted/cspreeti_A_calm_clear_day_with_deep_blue_skies_${U3}_0.png`,
      `002/DndBackdrop Images/midjourney_session_2024-2-19_[0-50]/cspreeti_a_snow_war_background_scene_${U4}.png`,
      'may/Haunted/archive.zip',
    ]);
    expect(entries).toEqual([
      {
        sourceKey: U4,
        collection: null,
        hint: 'a snow war background scene',
        images: [
          {
            file: `002/DndBackdrop Images/midjourney_session_2024-2-19_[0-50]/cspreeti_a_snow_war_background_scene_${U4}.png`,
            id: U4,
            position: 0,
          },
        ],
      },
      {
        sourceKey: U3,
        collection: 'Haunted',
        hint: 'A calm clear day with deep blue skies',
        images: [
          {
            file: `may/Haunted/cspreeti_A_calm_clear_day_with_deep_blue_skies_${U3}_0.png`,
            id: `${U3}-0`,
            position: 0,
          },
        ],
      },
    ]);
  });

  it('donne un titre provisoire lisible', () => {
    expect(provisionalTitle('  a derelict   clock tower ')).toBe('A derelict clock tower');
    expect(provisionalTitle('')).toBe('Sans titre');
  });
});

describe('source mappacks', () => {
  it('ne lit que les plans sans grille, un lieu par fichier, rangés par pack', () => {
    const { entries, skipped } = mapPackEntries([
      'Wizard Tower/Gridless/Wizard tower (890).webp',
      'Treasure rooms/Gridless/Treasure_room (7).webp',
      'Treasure rooms/Grid/Treasure_room (7).webp',
      'Vikings/Gridless/.DS_Store',
    ]);
    expect(entries).toEqual([
      {
        sourceKey: 'mp-treasure-rooms-0007',
        collection: 'Treasure rooms',
        hint: 'Treasure rooms',
        images: [
          {
            file: 'Treasure rooms/Gridless/Treasure_room (7).webp',
            id: 'mp-treasure-rooms-0007',
            position: 0,
          },
        ],
      },
      {
        sourceKey: 'mp-wizard-tower-0890',
        collection: 'Wizard Tower',
        hint: 'Wizard Tower',
        images: [
          {
            file: 'Wizard Tower/Gridless/Wizard tower (890).webp',
            id: 'mp-wizard-tower-0890',
            position: 0,
          },
        ],
      },
    ]);
    expect(skipped).toEqual(['Treasure rooms/Grid/Treasure_room (7).webp']);
  });
});
