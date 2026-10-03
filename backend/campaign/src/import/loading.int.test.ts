/**
 * Import des campagnes en base : écriture complète, rejeu sans doublon, membre
 * sans compte migré, personnage non importé, code déjà pris.
 */
import { uuidv7 } from '@vtt/contracts';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDb } from '../db/client.js';
import {
  campaignBans,
  campaignCharacters,
  campaignMembers,
  campaignMessages,
  campaigns,
  campaignSessions,
  legacyIds,
  outbox,
} from '../db/schema.js';
import type { CampaignToImport } from './grouping.js';
import type { FirestoreDoc } from './legacy.js';
import { LEGACY_SOURCE, loadCampaign, prepareCampaign, type Mappings } from './loading.js';
import { transformCampaign } from './transform.js';

const URL = process.env.TEST_DATABASE_URL;

const doc = (path: string, data: Record<string, unknown>): FirestoreDoc => ({
  path,
  id: path.split('/').at(-1)!,
  data,
});

/** Code à 6 chiffres libre (les campagnes de test sont supprimées ensuite). */
const randomCode = () => String(100000 + Math.floor(Math.random() * 900000));

function legacyCampaign(code: string): CampaignToImport {
  const c = (id: string) => `cartes/${code}/characters/${id}`;
  return {
    code,
    legacyId: `Salle/${code}`,
    doc: doc(`Salle/${code}`, {
      title: 'Les Mines de la Moria',
      isPublic: true,
      creatorId: 'uidMJ',
      bannedUsers: ['uidBanni'],
      gameSystemId: 'dnd-classic',
    }) as CampaignToImport['doc'],
    system: { gameSystemId: 'dnd-classic' },
    members: [
      { uid: 'uidMJ', sources: ['creator'], name: 'MJ' },
      { uid: 'uidA', sources: ['rooms', 'room_id'], persoId: 'p1' },
      { uid: 'uidSansCompte', sources: ['names'], name: 'Bea' },
    ],
    characters: [
      doc(c('p1'), { Nomperso: 'Aldo', type: 'joueurs' }),
      doc(c('pnj'), { Nomperso: 'Gobelin', type: 'pnj' }),
      doc(c('oublie'), { Nomperso: 'Bea', type: 'joueurs' }),
    ],
    sessions: [doc(`Salle/${code}/sessions/s1`, { date: { $timestamp: '2027-01-01T18:00:00Z' } })],
    messages: [
      doc(`Salle/${code}/chat/m2`, {
        uid: 'uidA',
        text: 'Présent !',
        timestamp: { $timestamp: '2026-09-01T10:05:00.000Z' },
      }),
      doc(`Salle/${code}/chat/m1`, {
        uid: 'uidMJ',
        text: 'Bienvenue',
        timestamp: { $timestamp: '2026-09-01T10:00:00.000Z' },
      }),
      doc(`Salle/${code}/chat/m3`, {
        uid: 'uidSansCompte',
        text: 'Perdu',
        timestamp: { $timestamp: '2026-09-01T10:10:00.000Z' },
      }),
    ],
  } as CampaignToImport;
}

describe.skipIf(!URL)('import des campagnes en base', () => {
  const { db, pool } = createDb(URL ?? '');
  const created: string[] = [];
  const correlations: string[] = [];
  afterAll(async () => {
    if (created.length) await db.delete(campaigns).where(inArray(campaigns.id, created));
    const events = (await db.select().from(outbox)).filter((o) =>
      correlations.includes((o.envelope as { correlationId?: string }).correlationId ?? ''),
    );
    if (events.length)
      await db.delete(outbox).where(
        inArray(
          outbox.id,
          events.map((o) => o.id),
        ),
      );
    await pool.end();
  });

  const accounts = { gm: uuidv7(), a: uuidv7(), banned: uuidv7() };
  const chars = { p1: uuidv7(), npc: uuidv7() };
  const mappings = (code: string): Mappings => ({
    accounts: new Map([
      ['uidMJ', accounts.gm],
      ['uidA', accounts.a],
      ['uidBanni', accounts.banned],
    ]),
    characters: new Map([
      [
        `cartes/${code}/characters/p1`,
        { id: chars.p1, ownerId: accounts.a, systemId: 'dnd-classic' },
      ],
      [
        `cartes/${code}/characters/pnj`,
        { id: chars.npc, ownerId: accounts.gm, systemId: 'dnd-classic' },
      ],
    ]),
  });

  function prepare(code: string) {
    const prep = prepareCampaign(transformCampaign(legacyCampaign(code)), mappings(code), '1.0.0');
    if (prep.status !== 'ready') throw new Error('campagne non prête');
    return prep;
  }

  it('écrit la campagne, ses membres, personnages, sessions, messages et son événement', async () => {
    const code = randomCode();
    const prep = prepare(code);
    // Membre sans compte migré, personnage non importé : écartés avec un avertissement
    expect(prep.warnings).toEqual(
      expect.arrayContaining([
        'Membre uidSansCompte sans compte migré : ignoré',
        `Personnage non importé : « Bea » (cartes/${code}/characters/oublie)`,
        '1 message(s) de uidSansCompte (sans compte migré) ignoré(s)',
      ]),
    );
    const correlation = uuidv7();
    correlations.push(correlation);
    const r = await loadCampaign(db, prep.campaign, `Salle/${code}`, correlation);
    expect(r).toMatchObject({ status: 'imported', code, warnings: [] });
    created.push(r.id);

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, r.id));
    expect(campaign).toMatchObject({
      name: 'Les Mines de la Moria',
      code,
      ownerId: accounts.gm,
      systemId: 'dnd-classic',
      isPublic: true,
      characterCreation: true,
    });
    const members = await db
      .select()
      .from(campaignMembers)
      .where(eq(campaignMembers.campaignId, r.id));
    expect(members.map((m) => [m.userId, m.role]).sort()).toEqual(
      [
        [accounts.gm, 'gm'],
        [accounts.a, 'player'],
      ].sort(),
    );
    const bans = await db.select().from(campaignBans).where(eq(campaignBans.campaignId, r.id));
    expect(bans).toMatchObject([{ userId: accounts.banned, bannedBy: accounts.gm }]);
    const characters = await db
      .select()
      .from(campaignCharacters)
      .where(eq(campaignCharacters.campaignId, r.id));
    expect(characters.map((c) => [c.characterId, c.side, c.playedBy]).sort()).toEqual(
      [
        [chars.p1, 'players', accounts.a],
        [chars.npc, 'enemies', null],
      ].sort(),
    );
    const sessions = await db
      .select()
      .from(campaignSessions)
      .where(eq(campaignSessions.campaignId, r.id));
    expect(sessions).toMatchObject([
      { scheduledAt: new Date('2027-01-01T18:00:00Z'), createdBy: accounts.gm },
    ]);
    const messages = await db
      .select()
      .from(campaignMessages)
      .where(eq(campaignMessages.campaignId, r.id))
      .orderBy(campaignMessages.id);
    expect(messages.map((m) => [m.body, m.createdAt.toISOString()])).toEqual([
      ['Bienvenue', '2026-09-01T10:00:00.000Z'],
      ['Présent !', '2026-09-01T10:05:00.000Z'],
    ]);
    const [link] = await db.select().from(legacyIds).where(eq(legacyIds.campaignId, r.id));
    expect(link).toMatchObject({ source: LEGACY_SOURCE, legacyId: `Salle/${code}` });
    const events = (await db.select().from(outbox)).filter(
      (o) => (o.envelope as { correlationId?: string }).correlationId === correlation,
    );
    expect(events.map((o) => o.envelope)).toMatchObject([
      {
        type: 'campaign.created',
        roomId: r.id,
        aggregate: { type: 'campaign', id: r.id },
        actor: { userId: null, role: 'system' },
        payload: { code, imported: true },
      },
    ]);

    // Rejeu : rien n'est réécrit
    const second = await loadCampaign(db, prepare(code).campaign, `Salle/${code}`, uuidv7());
    expect(second).toEqual({ status: 'already-imported', id: r.id });
    expect(await db.select().from(campaigns).where(eq(campaigns.code, code))).toHaveLength(1);
    expect(
      await db.select().from(campaignMessages).where(eq(campaignMessages.campaignId, r.id)),
    ).toHaveLength(2);
  });

  it('code déjà pris par une autre campagne : un nouveau code est tiré', async () => {
    const code = randomCode();
    const occupant = uuidv7();
    await db.insert(campaigns).values({
      id: occupant,
      name: 'Déjà là',
      systemId: 'dnd-classic',
      systemVersion: '1.0.0',
      ownerId: uuidv7(),
      code,
    });
    created.push(occupant);
    const correlation = uuidv7();
    correlations.push(correlation);
    const r = await loadCampaign(db, prepare(code).campaign, `Salle/${code}`, correlation);
    if (r.status !== 'imported') throw new Error('campagne non importée');
    created.push(r.id);
    expect(r.code).not.toBe(code);
    expect(r.warnings).toEqual([`Code ${code} déjà pris : nouveau code ${r.code}`]);
  });
});
