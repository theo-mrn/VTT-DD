/**
 * Règles pures de la progression (docs/progression.md) : périodes de Paris,
 * courbe et paliers, plafonds, activités tirées des événements, rotation des
 * défis et parcours guidé. Sans base de données.
 */
import { uuidv7, type EventEnvelope } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { catalogue } from '../titres/catalogue.js';
import { activitiesOf } from './activities.js';
import {
  ACTIVE_COUNT,
  activeChallenges,
  CHALLENGES,
  challengeById,
  nextSteps,
  PERMANENT_CHALLENGES,
} from './challenges.js';
import {
  bordersForLevel,
  LEVEL_REWARDS,
  levelForXp,
  nextReward,
  rewardsBetween,
  xpForLevel,
} from './levels.js';
import {
  addDays,
  isoWeek,
  mondayOf,
  parisDay,
  parisMidnight,
  periodsAt,
  weekDays,
} from './periods.js';
import { ACTIVITY_KINDS, cappedXp, XP_RULES } from './rules.js';

const USER = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
const OTHER = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6c';
const ROOM = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6d';

function envelope(
  type: string,
  payload: Record<string, unknown>,
  o: Partial<Pick<EventEnvelope, 'roomId' | 'occurredAt'>> & {
    userId?: string | null;
    role?: EventEnvelope['actor']['role'];
  } = {},
): EventEnvelope {
  return {
    id: uuidv7(),
    type,
    version: 1,
    occurredAt: o.occurredAt ?? '2026-10-07T10:00:00.000Z',
    roomId: o.roomId === undefined ? ROOM : o.roomId,
    actor: {
      userId: o.userId === undefined ? USER : o.userId,
      role: o.role ?? 'player',
      characterId: null,
    },
    aggregate: { type: 'x', id: 'y' },
    visibility: 'public',
    payload,
    correlationId: 'c',
    causationId: null,
    traceparent: null,
  };
}

describe('périodes de Paris', () => {
  it('prend le jour de Paris, pas celui d’UTC', () => {
    // 23 h 30 UTC le 6 octobre = 1 h 30 à Paris le 7 (heure d'été)
    expect(parisDay(new Date('2026-10-06T23:30:00Z'))).toBe('2026-10-07');
    // 23 h 30 UTC le 6 janvier = 0 h 30 à Paris le 7 (heure d'hiver)
    expect(parisDay(new Date('2026-01-06T23:30:00Z'))).toBe('2026-01-07');
    expect(parisDay(new Date('2026-01-06T22:59:00Z'))).toBe('2026-01-06');
  });

  it('calcule minuit à Paris, été comme hiver', () => {
    expect(parisMidnight('2026-10-07').toISOString()).toBe('2026-10-06T22:00:00.000Z');
    expect(parisMidnight('2026-01-07').toISOString()).toBe('2026-01-06T23:00:00.000Z');
    // Jour du passage à l'heure d'hiver (25 octobre 2026) : minuit est encore à UTC+2
    expect(parisMidnight('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(parisMidnight('2026-10-26').toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('semaines ISO, lundi au dimanche, y compris en fin d’année', () => {
    expect(mondayOf('2026-10-07')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(weekDays('2026-10-07')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(isoWeek('2026-10-07')).toBe('2026-W41');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(isoWeek('2024-12-30')).toBe('2025-W01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('donne les fins de période', () => {
    const p = periodsAt(new Date('2026-10-07T10:00:00Z'));
    expect(p).toEqual({
      day: '2026-10-07',
      week: '2026-W41',
      dailyEndsAt: new Date('2026-10-07T22:00:00.000Z'),
      weeklyEndsAt: new Date('2026-10-11T22:00:00.000Z'),
    });
  });
});

describe('niveaux', () => {
  it('suit la courbe 100 + 50 (n − 1)', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(250);
    expect(xpForLevel(5)).toBe(700);
    expect(xpForLevel(10)).toBe(2700);
    expect(xpForLevel(20)).toBe(10450);
    expect(xpForLevel(50)).toBe(63700);
    for (let n = 1; n < 100; n += 1)
      expect(xpForLevel(n + 1) - xpForLevel(n)).toBe(100 + 50 * (n - 1));
  });

  it('retrouve le niveau depuis l’XP, aux bornes exactes', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-5)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    for (let level = 1; level < 200; level += 1) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      expect(levelForXp(xpForLevel(level + 1) - 1)).toBe(level);
    }
  });

  it('donne les paliers franchis, les bordures acquises et la prochaine récompense', () => {
    expect(rewardsBetween(1, 2)).toEqual([]);
    expect(rewardsBetween(2, 5).map((r) => r.id)).toEqual(['blue', 'aventurier-confirme']);
    expect(bordersForLevel(1)).toEqual([]);
    expect(bordersForLevel(9)).toEqual(['blue', 'orange']);
    expect(nextReward(5)).toMatchObject({ level: 8, type: 'border', id: 'orange' });
    expect(nextReward(50)).toBeNull();
  });

  it('chaque titre de palier existe au catalogue avec la condition de son niveau', () => {
    const titres = new Map(catalogue().map((t) => [t.slug, t]));
    for (const r of LEVEL_REWARDS.filter((x) => x.type === 'title')) {
      expect(titres.get(r.id)?.condition, r.id).toEqual({ type: 'level', level: r.level });
      expect(titres.get(r.id)?.description).toBe(`Atteindre le niveau ${r.level} du compte`);
    }
  });

  it('les paliers sont croissants et les bordures ne sont pas des « Lueur »', () => {
    const niveaux = LEVEL_REWARDS.map((r) => r.level);
    expect(niveaux).toEqual([...niveaux].sort((a, b) => a - b));
    for (const r of LEVEL_REWARDS.filter((x) => x.type === 'border'))
      expect(r.id).not.toMatch(/shine|purple/);
  });
});

describe('règles d’XP', () => {
  it('a une règle pour chaque activité', () => {
    expect(Object.keys(XP_RULES).sort()).toEqual([...ACTIVITY_KINDS].sort());
  });

  it('plafonne l’XP du jour sans jamais devenir négative', () => {
    expect(cappedXp('dice_roll', 1, 0)).toBe(2);
    expect(cappedXp('dice_roll', 1, 39)).toBe(1);
    expect(cappedXp('dice_roll', 1, 40)).toBe(0);
    expect(cappedXp('dice_roll', 1, 400)).toBe(0);
    expect(cappedXp('play_minutes', 60, 0)).toBe(30);
    expect(cappedXp('profile_completed', 1, 1000)).toBe(50);
  });
});

describe('activités tirées des événements', () => {
  const roll = (source: string, o: Parameters<typeof envelope>[2] = {}) =>
    envelope('dice.rolled', { authorId: USER, source, dice: [] }, o);

  it('un vrai jet dans une campagne : jet et séance du jour de Paris', () => {
    const e = roll('3d', { occurredAt: '2026-10-06T23:30:00.000Z' });
    expect(activitiesOf(e)).toEqual([
      { userId: USER, kind: 'dice_roll', units: 1 },
      { userId: USER, kind: 'session_played', units: 1, key: `${ROOM}:2026-10-07` },
    ]);
  });

  it('un jet personnel compte sans séance ; import et api ne comptent pas', () => {
    expect(activitiesOf(roll('free', { roomId: null }))).toEqual([
      { userId: USER, kind: 'dice_roll', units: 1 },
    ]);
    expect(activitiesOf(roll('import'))).toEqual([]);
    expect(activitiesOf(roll('api'))).toEqual([]);
  });

  it('message de campagne : auteur du message', () => {
    const e = envelope('campaign.message_posted', { authorId: OTHER }, { userId: USER });
    expect(activitiesOf(e).map((a) => [a.userId, a.kind])).toEqual([
      [OTHER, 'chat_message'],
      [OTHER, 'session_played'],
    ]);
  });

  it('campagne créée par le MJ, pas par l’import', () => {
    expect(activitiesOf(envelope('campaign.created', {}, { role: 'gm' }))).toEqual([
      { userId: USER, kind: 'campaign_created', units: 1 },
    ]);
    expect(
      activitiesOf(envelope('campaign.created', {}, { userId: null, role: 'system' })),
    ).toEqual([]);
  });

  it('campagne rejointe : unique par campagne', () => {
    expect(activitiesOf(envelope('campaign.member_joined', { userId: USER }))).toEqual([
      { userId: USER, kind: 'campaign_joined', units: 1, key: ROOM },
    ]);
  });

  it('personnage d’un joueur seulement', () => {
    const joueur = envelope('character.created', { type: 'pj' }, { role: 'user', roomId: null });
    expect(activitiesOf(joueur)).toEqual([{ userId: USER, kind: 'character_created', units: 1 }]);
    expect(activitiesOf(envelope('character.created', { kind: 'npc' }, { role: 'gm' }))).toEqual(
      [],
    );
    expect(
      activitiesOf(envelope('character.created', {}, { userId: null, role: 'system' })),
    ).toEqual([]);
  });

  it('séance planifiée, note écrite, temps de jeu', () => {
    expect(activitiesOf(envelope('campaign.session_scheduled', {}, { role: 'gm' }))).toEqual([
      { userId: USER, kind: 'session_scheduled', units: 1 },
    ]);
    expect(activitiesOf(envelope('note.created', { ownerId: USER }))).toEqual([
      { userId: USER, kind: 'note_written', units: 1 },
    ]);
    const temps = envelope('identity.play_time_added', { minutes: 5 }, { roomId: null });
    expect(activitiesOf(temps)).toEqual([{ userId: USER, kind: 'play_minutes', units: 5 }]);
    const tropLong = envelope('identity.play_time_added', { minutes: 500 }, { roomId: null });
    expect(activitiesOf(tropLong)).toEqual([]);
  });

  it('amitié acceptée : les deux joueurs, chacun une fois par ami', () => {
    const e = envelope(
      'identity.friend_request_accepted',
      { friendId: OTHER },
      { roomId: null, role: 'user' },
    );
    expect(activitiesOf(e)).toEqual([
      { userId: USER, kind: 'friend_added', units: 1, key: OTHER },
      { userId: OTHER, kind: 'friend_added', units: 1, key: USER },
    ]);
  });

  it('profil : seulement si l’avatar ou la bio change, vérifié en base', () => {
    const avatar = envelope(
      'identity.profile_updated',
      { fields: ['avatarUrl'] },
      { roomId: null },
    );
    expect(activitiesOf(avatar)).toEqual([
      {
        userId: USER,
        kind: 'profile_completed',
        units: 1,
        key: 'once',
        condition: 'profile_complete',
      },
    ]);
    const nom = envelope('identity.profile_updated', { fields: ['name'] }, { roomId: null });
    expect(activitiesOf(nom)).toEqual([]);
  });

  it('ignore les autres événements et les charges utiles invalides', () => {
    expect(activitiesOf(envelope('campaign.updated', {}))).toEqual([]);
    expect(activitiesOf(envelope('dice.rolled', { source: 42 }))).toEqual([]);
  });
});

describe('défis', () => {
  it('identifiants uniques et valides pour la contrainte SQL', () => {
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
    for (const c of CHALLENGES) {
      expect(c.target, c.id).toBeGreaterThan(0);
      expect(c.xp, c.id).toBeGreaterThan(0);
      expect(c.activities.length, c.id).toBeGreaterThan(0);
    }
    expect(challengeById('first_profile')?.group).toBe('first_steps');
  });

  it('rotation déterministe, propre au joueur, sans deux défis de la même activité', () => {
    const a = activeChallenges(USER, 'daily', '2026-10-07');
    expect(a).toHaveLength(ACTIVE_COUNT.daily);
    expect(activeChallenges(USER, 'daily', '2026-10-07')).toEqual(a);
    expect(new Set(a.map((c) => c.activities[0])).size).toBe(a.length);
    expect(activeChallenges(USER.toUpperCase(), 'daily', '2026-10-07')).toEqual(a);

    const w = activeChallenges(USER, 'weekly', '2026-W41');
    expect(w).toHaveLength(ACTIVE_COUNT.weekly);
    for (const c of w) expect(c.kind).toBe('weekly');

    // Sur un mois, la sélection change d'un jour à l'autre et d'un joueur à l'autre
    const jours = Array.from({ length: 30 }, (_, i) => addDays('2026-10-01', i));
    const selections = new Set(
      jours.map((d) =>
        activeChallenges(USER, 'daily', d)
          .map((c) => c.id)
          .join(),
      ),
    );
    expect(selections.size).toBeGreaterThan(3);
    const autres = jours.filter(
      (d) =>
        activeChallenges(USER, 'daily', d)
          .map((c) => c.id)
          .join() !==
        activeChallenges(OTHER, 'daily', d)
          .map((c) => c.id)
          .join(),
    );
    expect(autres.length).toBeGreaterThan(0);
  });

  it('prochaines étapes : Premiers pas dans l’ordre, puis les jalons les plus avancés', () => {
    const etat = (done: string[], progress: Record<string, number> = {}) =>
      PERMANENT_CHALLENGES.map((challenge) => ({
        challenge,
        progress: progress[challenge.id] ?? 0,
        completed: done.includes(challenge.id),
      }));
    expect(nextSteps(etat([])).map((s) => s.challenge.id)).toEqual([
      'first_profile',
      'first_character',
      'first_campaign',
    ]);
    expect(nextSteps(etat(['first_profile', 'first_campaign'])).map((s) => s.challenge.id)).toEqual(
      ['first_character', 'first_roll', 'first_session'],
    );
    const tousPremiers = PERMANENT_CHALLENGES.filter((c) => c.group === 'first_steps').map(
      (c) => c.id,
    );
    expect(
      nextSteps(etat(tousPremiers, { rolls_100: 90, notes_25: 20, sessions_10: 1 })).map(
        (s) => s.challenge.id,
      ),
    ).toEqual(['rolls_100', 'notes_25', 'sessions_10']);
  });
});
