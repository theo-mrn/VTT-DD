/**
 * Moteur des archives de campagne (docs/export-campagne.md § 4) : JSON des lignes et garde-fous
 * de la réinsertion (campagne forcée, comptes, identifiants hors archive).
 */
import { boolean, customType, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  encodeRow,
  parentsFirst,
  prepareRow,
  type ArchiveImportContext,
  type ArchiveTable,
} from './archive-tables.js';

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({ dataType: () => 'bytea' });

const things = pgTable('things', {
  id: uuid('id').primaryKey(),
  campaignId: uuid('campaign_id').notNull(),
  mapId: uuid('map_id').notNull(),
  groupId: uuid('group_id'),
  packId: uuid('pack_id'),
  createdBy: uuid('created_by').notNull(),
  visibleTo: uuid('visible_to').array().notNull().default([]),
  sharedWith: uuid('shared_with').array(),
  seq: integer('seq').generatedAlwaysAsIdentity(),
  cells: bytea('cells'),
  name: text('name').notNull(),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const spec: ArchiveTable = {
  table: things,
  scope: things.campaignId,
  users: ['createdBy'],
  userLists: ['sharedWith'],
  external: ['packId'],
};

const ID = '0190a1b2-c3d4-7e5f-8a9b-000000000001';
const MAP = '0190a1b2-c3d4-7e5f-8a9b-000000000002';
const TOKEN = '0190a1b2-c3d4-7e5f-8a9b-000000000003';
const ELSEWHERE = '0190a1b2-c3d4-7e5f-8a9b-0000000000ff';
const ctx: ArchiveImportContext = {
  campaignId: '0190ffff-0000-7000-8000-00000000000c',
  ownerId: '0190ffff-0000-7000-8000-00000000000a',
  options: { keepProgress: true },
  known: new Set([ID, MAP, TOKEN]),
};

const raw = (extra: Record<string, unknown> = {}) =>
  encodeRow({
    id: ID,
    campaignId: ELSEWHERE,
    mapId: MAP,
    groupId: null,
    packId: ELSEWHERE,
    createdBy: ELSEWHERE,
    visibleTo: [TOKEN, ELSEWHERE],
    sharedWith: [ELSEWHERE],
    seq: 42,
    cells: new Uint8Array([1, 2, 255]),
    name: 'Porte',
    hidden: true,
    createdAt: new Date('2026-11-11T10:00:00.000Z'),
    ...extra,
  });

describe('encodeRow', () => {
  it('rend des valeurs JSON : dates ISO, octets en base64', () => {
    const row = raw();
    expect(row.createdAt).toBe('2026-11-11T10:00:00.000Z');
    expect(row.cells).toEqual({ $bytes: 'AQL/' });
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });
});

describe('prepareRow', () => {
  it('force la campagne et le propriétaire, vide les listes de comptes, relit dates et octets', () => {
    const row = prepareRow(spec, raw(), ctx)!;
    expect(row).toMatchObject({
      id: ID,
      campaignId: ctx.campaignId,
      mapId: MAP,
      groupId: null,
      packId: ELSEWHERE,
      createdBy: ctx.ownerId,
      visibleTo: [TOKEN],
      sharedWith: null,
      name: 'Porte',
      hidden: true,
    });
    expect(row.createdAt).toEqual(new Date('2026-11-11T10:00:00.000Z'));
    expect(row.cells).toEqual(new Uint8Array([1, 2, 255]));
    expect('seq' in row).toBe(false);
  });

  it('coupe un lien facultatif hors de l’archive, écarte la ligne si le lien est obligatoire', () => {
    expect(prepareRow(spec, raw({ groupId: ELSEWHERE }), ctx)!.groupId).toBeNull();
    expect(prepareRow(spec, raw({ mapId: ELSEWHERE }), ctx)).toBeNull();
    expect(prepareRow(spec, raw({ id: ELSEWHERE }), ctx)).toBeNull();
  });

  it('ignore les colonnes inconnues et laisse les absentes à leur valeur par défaut', () => {
    const { hidden: _, ...partial } = raw({ ancienneColonne: 'x' });
    const row = prepareRow(spec, partial, ctx)!;
    expect('ancienneColonne' in row).toBe(false);
    expect('hidden' in row).toBe(false);
  });

  it('applique la retouche du service', () => {
    const named = { ...spec, importRow: (r: Record<string, unknown>) => ({ ...r, name: 'Copie' }) };
    expect(prepareRow(named, raw(), ctx)!.name).toBe('Copie');
    expect(prepareRow({ ...spec, importRow: () => null }, raw(), ctx)).toBeNull();
  });
});

describe('parentsFirst', () => {
  it('range les parents avant les enfants, coupe les parents absents et les boucles', () => {
    const rows = [
      { id: 'c', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'a', parentId: null },
      { id: 'x', parentId: 'absent' },
      { id: 'p', parentId: 'q' },
      { id: 'q', parentId: 'p' },
    ];
    const out = parentsFirst(rows, 'parentId');
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c', 'x', 'q', 'p']);
    expect(out.find((r) => r.id === 'x')!.parentId).toBeNull();
    expect(out.find((r) => r.id === 'q')!.parentId).toBeNull();
    expect(out.find((r) => r.id === 'p')!.parentId).toBe('q');
  });
});
