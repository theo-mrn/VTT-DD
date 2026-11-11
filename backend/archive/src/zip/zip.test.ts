/**
 * Archive `.yner` (docs/export-campagne.md § 4) : écrite en flux, relue par plages, avec ses
 * gardes (empreintes, entrées inattendues, tables déclarées).
 */
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import yazl from 'yazl';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../test/memory-store.js';
import { openArchive } from './read.js';
import { writeArchive, type ArchiveInput } from './write.js';

const CAMPAIGN = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const big = randomBytes(1024 * 1024 + 17);
const small = Buffer.from('<svg/>');

function input(): ArchiveInput {
  return {
    head: {
      format: 1,
      kind: 'campaign',
      exportedAt: '2026-11-11T10:00:00.000Z',
      campaign: { id: CAMPAIGN, name: 'La Crypte', systemId: 'dnd-classic', systemVersion: '1' },
      options: { keepProgress: true },
    },
    schemaVersions: { campaign: '0040', character: '0014' },
    tables: [
      { service: 'campaign', table: 'campaigns', rows: [{ id: CAMPAIGN, name: 'La Crypte' }] },
      { service: 'campaign', table: 'maps', rows: [] },
      { service: 'character', table: 'characters', rows: [{ id: 'x' }, { id: 'y' }] },
    ],
    files: [
      {
        key: `campaigns/${CAMPAIGN}/fond.webp`,
        size: big.length,
        contentType: 'image/webp',
        open: async () => Readable.from([big.subarray(0, 1000), big.subarray(1000)]),
      },
      {
        key: `campaigns/${CAMPAIGN}/logo.svg`,
        size: small.length,
        contentType: 'image/svg+xml',
        open: async () => Readable.from([small]),
      },
    ],
  };
}

describe('archive .yner', () => {
  it('s’écrit en flux et se relit par plages', async () => {
    const { store, objects } = memoryStore();
    const progress: number[] = [];
    const { manifest, size } = await writeArchive(store, 'exports/a.yner', input(), (p) =>
      progress.push(p),
    );
    expect(size).toBe(objects.get('exports/a.yner')!.data.length);
    expect(progress.at(-1)).toBe(1);
    expect(manifest.services).toEqual({
      campaign: { schemaVersion: '0040', tables: { campaigns: 1, maps: 0 } },
      character: { schemaVersion: '0014', tables: { characters: 2 } },
    });
    expect(manifest.files.map((f) => [f.index, f.size])).toEqual([
      [0, big.length],
      [1, small.length],
    ]);

    const archive = await openArchive(store, 'exports/a.yner');
    expect(archive.manifest).toEqual(manifest);
    expect(await archive.rows('character', 'characters')).toEqual([{ id: 'x' }, { id: 'y' }]);
    expect(await archive.rows('audio', 'assets')).toEqual([]);
    expect(await buffer(await archive.file(manifest.files[0]!))).toEqual(big);
    expect(await buffer(await archive.file(manifest.files[1]!))).toEqual(small);
    archive.close();
  });

  it('refuse un fichier dont l’empreinte ne correspond pas', async () => {
    const { store } = memoryStore();
    const { manifest } = await writeArchive(store, 'a.yner', input());
    const archive = await openArchive(store, 'a.yner');
    const forged = { ...manifest.files[1]!, sha256: '0'.repeat(64) };
    await expect(buffer(await archive.file(forged))).rejects.toThrow(/Empreinte/);
  });

  it('refuse un zip avec une entrée inattendue ou sans manifeste', async () => {
    const { store, put } = memoryStore();
    const zip = (entries: Record<string, string>) => {
      const z = new yazl.ZipFile();
      for (const [path, content] of Object.entries(entries))
        z.addBuffer(Buffer.from(content), path);
      z.end();
      return buffer(z.outputStream as Readable);
    };
    put('x.yner', await zip({ 'manifest.json': '{}', 'script.sh': 'rm -rf' }));
    await expect(openArchive(store, 'x.yner')).rejects.toMatchObject({ code: 'archive_invalid' });
    put('y.yner', await zip({ 'tables/campaign/maps.json': '[]' }));
    await expect(openArchive(store, 'y.yner')).rejects.toThrow(/Manifeste absent/);
    put('z.yner', await zip({ 'manifest.json': '{"format":7}' }));
    await expect(openArchive(store, 'z.yner')).rejects.toMatchObject({
      code: 'archive_unsupported_version',
    });
    put('w.yner', Buffer.from('pas un zip'));
    await expect(openArchive(store, 'w.yner')).rejects.toMatchObject({ code: 'archive_invalid' });
  });

  it('refuse une table qui ne compte pas les lignes annoncées', async () => {
    const { store, put } = memoryStore();
    const head = input().head;
    const manifest = {
      ...head,
      services: { campaign: { schemaVersion: '0040', tables: { maps: 2, notes: 1 } } },
      files: [],
    };
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json');
    z.addBuffer(Buffer.from('[{"id":"a"}]'), 'tables/campaign/maps.json');
    z.end();
    put('t.yner', await buffer(z.outputStream as Readable));
    const archive = await openArchive(store, 't.yner');
    await expect(archive.rows('campaign', 'maps')).rejects.toThrow(/invalide/);
    await expect(archive.rows('campaign', 'notes')).rejects.toThrow(/absente/);
  });
});
