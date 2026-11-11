/**
 * Format de l'archive d'une campagne (docs/export-campagne.md § 4) : manifeste, chemins du zip,
 * adresses de fichiers et renouvellement des identifiants.
 */
import { describe, expect, it } from 'vitest';
import {
  ArchiveFileKey,
  ArchiveManifest,
  archiveFilePath,
  archiveTablePath,
  fileOwner,
  fromFileRefs,
  parseArchivePath,
  remapIds,
  rowIds,
  toFileRefs,
} from './archive.js';

const BASE = 'https://assets.yner.fr';
const CAMPAIGN = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const CHARACTER = '0190a1b2-c3d4-7e5f-8a9b-111111111111';
const SHA = 'a'.repeat(64);

const manifest = (extra: Record<string, unknown> = {}) => ({
  format: 1,
  kind: 'campaign',
  exportedAt: '2026-11-11T10:00:00.000Z',
  campaign: { id: CAMPAIGN, name: 'La Crypte', systemId: 'dnd5e', systemVersion: '1' },
  options: { keepProgress: true },
  services: {
    campaign: { schemaVersion: '0040', tables: { campaigns: 1, maps: 3 } },
    character: { schemaVersion: '0021', tables: { characters: 4 } },
  },
  files: [
    {
      index: 0,
      key: `campaigns/${CAMPAIGN}/fond.webp`,
      sha256: SHA,
      size: 1200,
      contentType: 'image/webp',
    },
  ],
  ...extra,
});

describe('ArchiveManifest', () => {
  it('lit un manifeste complet', () => {
    expect(ArchiveManifest.safeParse(manifest()).success).toBe(true);
  });

  it('refuse un format inconnu, un service inconnu, des fichiers en double', () => {
    expect(ArchiveManifest.safeParse(manifest({ format: 2 })).success).toBe(false);
    expect(
      ArchiveManifest.safeParse(
        manifest({ services: { dice: { schemaVersion: '1', tables: {} } } }),
      ).success,
    ).toBe(false);
    const file = manifest().files[0];
    expect(ArchiveManifest.safeParse(manifest({ files: [file, file] })).success).toBe(false);
  });
});

describe('clés de fichiers', () => {
  it('n’accepte que les dossiers de la campagne, sans remontée', () => {
    expect(ArchiveFileKey.safeParse(`campaigns/${CAMPAIGN}/a.webp`).success).toBe(true);
    expect(ArchiveFileKey.safeParse(`audio/assets/${CAMPAIGN}/x/play.opus`).success).toBe(true);
    expect(ArchiveFileKey.safeParse(`characters/${CHARACTER}/portrait.webp`).success).toBe(true);
    expect(ArchiveFileKey.safeParse(`campaigns/${CAMPAIGN}/../x.webp`).success).toBe(false);
    expect(ArchiveFileKey.safeParse('marketplace/fiche/a.webp').success).toBe(false);
    expect(ArchiveFileKey.safeParse(`avatars/${CHARACTER}/a.webp`).success).toBe(false);
  });

  it('donne le propriétaire d’une clé', () => {
    expect(fileOwner(`audio/assets/${CAMPAIGN}/x/play.opus`)).toEqual({
      folder: 'audio/assets',
      ownerId: CAMPAIGN,
    });
    expect(fileOwner('banners/x.webp')).toBeNull();
  });
});

describe('chemins du zip', () => {
  it('reconnaît manifeste, tables et fichiers, rien d’autre', () => {
    expect(parseArchivePath('manifest.json')).toEqual({ kind: 'manifest' });
    expect(parseArchivePath(archiveTablePath('campaign', 'map_obstacles'))).toEqual({
      kind: 'table',
      service: 'campaign',
      table: 'map_obstacles',
    });
    expect(parseArchivePath(archiveFilePath(12))).toEqual({ kind: 'file', index: 12 });
    expect(parseArchivePath('files/012')).toBeNull();
    expect(parseArchivePath('tables/dice/rolls.json')).toBeNull();
    expect(parseArchivePath('../manifest.json')).toBeNull();
    expect(parseArchivePath('files/1/../../x')).toBeNull();
  });
});

describe('adresses de fichiers', () => {
  const row = {
    backgroundUrl: `${BASE}/campaigns/${CAMPAIGN}/fond.webp`,
    html: `<p>Voir <img src="${BASE}/campaigns/${CAMPAIGN}/carte.png?v=2"> et ${BASE}/characters/${CHARACTER}/portrait.webp.</p>`,
    pack: `${BASE}/marketplace/fiche/a.webp`,
    other: 'https://exemple.fr/campaigns/x/y.png',
    nested: [{ imageUrl: `${BASE}/audio/assets/${CAMPAIGN}/s1/play.opus` }],
  };

  it('remplace les adresses de la campagne, même dans du HTML, et rend leurs clés', () => {
    const { value, keys } = toFileRefs(row, `${BASE}/`);
    expect(value.backgroundUrl).toBe(`yner-file:campaigns/${CAMPAIGN}/fond.webp`);
    expect(value.html).toBe(
      `<p>Voir <img src="yner-file:campaigns/${CAMPAIGN}/carte.png?v=2"> et yner-file:characters/${CHARACTER}/portrait.webp.</p>`,
    );
    expect(value.pack).toBe(row.pack);
    expect(value.other).toBe(row.other);
    expect([...keys].sort()).toEqual(
      [
        `audio/assets/${CAMPAIGN}/s1/play.opus`,
        `campaigns/${CAMPAIGN}/carte.png`,
        `campaigns/${CAMPAIGN}/fond.webp`,
        `characters/${CHARACTER}/portrait.webp`,
      ].sort(),
    );
  });

  it('laisse en adresse une clé refusée', () => {
    const { value, keys } = toFileRefs(row, BASE, (k) => k.startsWith('campaigns/'));
    expect(value.html).toContain(`${BASE}/characters/${CHARACTER}/portrait.webp`);
    expect([...keys].every((k) => k.startsWith('campaigns/'))).toBe(true);
  });

  it('revient aux adresses publiques, éventuellement sur un autre stockage', () => {
    const { value } = toFileRefs(row, BASE);
    expect(fromFileRefs(value, BASE)).toEqual(row);
    expect(fromFileRefs(value, 'https://cdn.autre.fr').backgroundUrl).toBe(
      `https://cdn.autre.fr/campaigns/${CAMPAIGN}/fond.webp`,
    );
  });
});

describe('identifiants', () => {
  it('renouvelle les identifiants connus partout, garde les autres', () => {
    const NEW_C = '0190ffff-0000-7000-8000-000000000001';
    const NEW_P = '0190ffff-0000-7000-8000-000000000002';
    const PLAYER = '0190a1b2-c3d4-7e5f-8a9b-999999999999';
    const map = new Map([
      [CAMPAIGN, NEW_C],
      [CHARACTER, NEW_P],
    ]);
    const value = {
      id: CHARACTER,
      campaignId: CAMPAIGN.toUpperCase(),
      ownerId: PLAYER,
      visibleTo: [CHARACTER],
      tokens: { [CHARACTER]: { x: 1 } },
      html: `<span data-mention="${CHARACTER}">Aria</span>`,
      url: `yner-file:characters/${CHARACTER}/portrait.webp`,
      n: 3,
      ok: true,
      none: null,
    };
    expect(remapIds(value, map)).toEqual({
      id: NEW_P,
      campaignId: NEW_C,
      ownerId: PLAYER,
      visibleTo: [NEW_P],
      tokens: { [NEW_P]: { x: 1 } },
      html: `<span data-mention="${NEW_P}">Aria</span>`,
      url: `yner-file:characters/${NEW_P}/portrait.webp`,
      n: 3,
      ok: true,
      none: null,
    });
  });

  it('rassemble les identifiants des lignes', () => {
    expect([...rowIds([[{ id: CAMPAIGN }, { id: 3 }], [{ id: CHARACTER.toUpperCase() }]])]).toEqual(
      [CAMPAIGN, CHARACTER],
    );
  });
});
