import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PREFIXE_INCONNU, transformerClesApi } from './cles-api.js';
import { transformerLiensDiscord } from './discord.js';
import { analyserNdjson, dateFirestore } from './ndjson.js';

const now = new Date('2026-09-26T10:00:00.000Z');
const uuidParUid = new Map([
  ['uid-alice', '0190a000-0000-7000-8000-000000000001'],
  ['uid-bob', '0190a000-0000-7000-8000-000000000002'],
  ['discord_123456789012345678', '0190a000-0000-7000-8000-000000000003'],
]);
const hex = (cle: string) => createHash('sha256').update(cle).digest('hex');

describe('lecture NDJSON', () => {
  it('lit les lignes {path, id, data} et ignore les lignes vides', () => {
    const docs = analyserNdjson(
      '{"path":"apiKeys/a","id":"a","data":{"uid":"x"}}\n\n{"id":"b","data":{}}\n',
      'test',
    );
    expect(docs).toEqual([
      { path: 'apiKeys/a', id: 'a', data: { uid: 'x' } },
      { path: 'b', id: 'b', data: {} },
    ]);
  });

  it('signale la ligne fautive sans en recopier le contenu', () => {
    expect(() => analyserNdjson('{"id":"a","data":{}}\n{"id":1}', 'f.ndjson')).toThrow(
      'f.ndjson:2 :',
    );
    expect(() => analyserNdjson('pas du json', 'f.ndjson')).toThrow('f.ndjson:1 : JSON invalide');
  });

  it('lit les dates balisées, ISO ou en millisecondes', () => {
    expect(dateFirestore({ $timestamp: '2025-01-02T03:04:05.123456789Z' })).toEqual(
      new Date('2025-01-02T03:04:05.123Z'),
    );
    expect(dateFirestore('2025-01-02T03:04:05Z')).toEqual(new Date('2025-01-02T03:04:05Z'));
    expect(dateFirestore(1735787045000)).toEqual(new Date(1735787045000));
    expect(dateFirestore(null)).toBeNull();
    expect(dateFirestore({ $timestamp: 'n’importe quoi' })).toBeNull();
  });
});

describe("transformation des clés d'API", () => {
  const cleAlice = 'vtt_' + 'ab'.repeat(32);

  it('reprend empreinte, nom, dates et compte, sans jamais la clé', () => {
    const { cles, rapport } = transformerClesApi(
      [
        {
          path: 'apiKeys/k1',
          id: 'k1',
          data: {
            uid: 'uid-alice',
            keyHash: hex(cleAlice),
            label: 'bot discord',
            createdAt: { $timestamp: '2025-03-01T12:00:00.000000000Z' },
            lastUsed: { $timestamp: '2025-04-01T12:00:00.000000000Z' },
          },
        },
      ],
      uuidParUid,
      now,
    );
    expect(rapport).toEqual({ lues: 1, valides: 1, sansCompte: 0, invalides: 0, doublons: 0 });
    const [cle] = cles;
    expect(cle).toMatchObject({
      userId: uuidParUid.get('uid-alice'),
      name: 'bot discord',
      prefix: PREFIXE_INCONNU,
      createdAt: new Date('2025-03-01T12:00:00.000Z'),
      lastUsedAt: new Date('2025-04-01T12:00:00.000Z'),
    });
    // Même SHA-256 que l'ancienne app : la clé existante reste valable
    expect(cle!.keyHash.equals(createHash('sha256').update(cleAlice).digest())).toBe(true);
    expect(cle!.keyHash).toHaveLength(32);
    // UUIDv7 daté de la création d'origine
    expect(parseInt(cle!.id.replace(/-/g, '').slice(0, 12), 16)).toBe(
      new Date('2025-03-01T12:00:00.000Z').getTime(),
    );
    expect(JSON.stringify(cles)).not.toContain(cleAlice);
  });

  it('compte les clés invalides, orphelines et en double', () => {
    const { cles, rapport } = transformerClesApi(
      [
        { path: 'apiKeys/a', id: 'a', data: { uid: 'uid-bob', keyHash: hex('x'), name: 'n' } },
        { path: 'apiKeys/b', id: 'b', data: { uid: 'uid-bob', keyHash: hex('x') } },
        { path: 'apiKeys/c', id: 'c', data: { uid: 'inconnu', keyHash: hex('y') } },
        { path: 'apiKeys/d', id: 'd', data: { uid: 'uid-bob', keyHash: 'pas-un-hash' } },
        { path: 'apiKeys/e', id: 'e', data: { keyHash: hex('z') } },
      ],
      uuidParUid,
      now,
    );
    expect(rapport).toEqual({ lues: 5, valides: 1, sansCompte: 1, invalides: 2, doublons: 1 });
    expect(cles[0]!.name).toBe('n');
  });

  it('donne un nom par défaut, tronque les noms trop longs et date les clés sans date', () => {
    const { cles } = transformerClesApi(
      [
        { path: 'apiKeys/a', id: 'a', data: { uid: 'uid-bob', keyHash: hex('1'), label: '  ' } },
        {
          path: 'apiKeys/b',
          id: 'b',
          data: { uid: 'uid-bob', keyHash: hex('2'), label: 'x'.repeat(100) },
        },
      ],
      uuidParUid,
      now,
    );
    expect(cles[0]!.name).toBe('Clé importée');
    expect(cles[0]!.createdAt).toEqual(now);
    expect(cles[0]!.lastUsedAt).toBeNull();
    expect(cles[1]!.name).toHaveLength(64);
  });
});

describe('transformation des liens Discord', () => {
  it('reprend les liens du bot vers le compte Firebase', () => {
    const { liens, rapport } = transformerLiensDiscord(
      [
        {
          path: 'discordLinks/987654321098765432',
          id: '987654321098765432',
          data: { uid: 'uid-alice', linkedAt: { $timestamp: '2025-05-05T05:05:05.000000000Z' } },
        },
      ],
      new Map(),
      uuidParUid,
      now,
    );
    expect(liens).toEqual([
      {
        providerAccountId: '987654321098765432',
        userId: uuidParUid.get('uid-alice'),
        createdAt: new Date('2025-05-05T05:05:05.000Z'),
      },
    ]);
    expect(rapport).toMatchObject({ lus: 1, valides: 1, sansCompte: 0, invalides: 0 });
  });

  it('reprend les comptes créés par la connexion Discord, prioritaires sur le bot', () => {
    const profils = new Map<string, Record<string, unknown>>([
      ['discord_123456789012345678', { name: 'Zed', discordId: '123456789012345678' }],
      ['uid-alice', { name: 'Alice' }],
    ]);
    const { liens, rapport } = transformerLiensDiscord(
      [
        // Le même Discord lié au bot depuis un autre compte : le compte Discord garde son lien
        {
          path: 'discordLinks/123456789012345678',
          id: '123456789012345678',
          data: { uid: 'uid-alice' },
        },
        // Le compte Discord lié à lui-même : pas un doublon
        {
          path: 'discordLinks/123456789012345678',
          id: '123456789012345678',
          data: { uid: 'discord_123456789012345678' },
        },
      ],
      profils,
      uuidParUid,
      now,
    );
    expect(liens).toEqual([
      {
        providerAccountId: '123456789012345678',
        userId: uuidParUid.get('discord_123456789012345678'),
        createdAt: now,
      },
    ]);
    expect(rapport).toEqual({
      lus: 2,
      comptesDiscord: 1,
      valides: 1,
      sansCompte: 0,
      invalides: 0,
      doublons: 1,
    });
  });

  it('compte les liens invalides et sans compte, ignore les sous-collections', () => {
    const { liens, rapport } = transformerLiensDiscord(
      [
        { path: 'discordLinks/abc', id: 'abc', data: { uid: 'uid-alice' } },
        { path: 'discordLinks/111111111111111111', id: '111111111111111111', data: {} },
        { path: 'discordLinks/222222222222222222', id: '222222222222222222', data: { uid: 'x' } },
        { path: 'discordLinks/3/sous/4', id: '4', data: { uid: 'uid-alice' } },
      ],
      new Map([['discord_pas-un-id', {}]]),
      uuidParUid,
      now,
    );
    expect(liens).toEqual([]);
    expect(rapport).toEqual({
      lus: 3,
      comptesDiscord: 1,
      valides: 0,
      sansCompte: 1,
      invalides: 3,
      doublons: 0,
    });
  });
});
