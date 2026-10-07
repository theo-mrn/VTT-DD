/**
 * Reprise de l'existant (docs/progression.md § 9) : relit ce que chaque joueur
 * a déjà fait dans les autres services, puis relève ses compteurs à vie,
 * accomplit les défis permanents atteints. Facultatif : le niveau part tout seul du niveau
 * d'avant (temps de jeu), sans cette reprise.
 *
 * Lecture : une connexion qui lit les schémas identity, characters, campaign et
 * dice (commande d'exploitation lancée une fois au déploiement, jamais par le
 * service). Écriture : la base d'identity et le code du service
 * (backfillUserInTx), donc les mêmes règles et les mêmes événements.
 *
 * Les jets importés de l'ancienne app comptent ici (ce sont de vrais jets
 * passés) ; ceux d'une clé d'API, non.
 */
import { uuidv7 } from '@vtt/contracts';
import type { Pool } from 'pg';
import type { Db } from '../../db/client.js';
import { backfillUserInTx, type BackfillResult } from './service.js';
import type { ActivityKind } from './rules.js';
import { TIME_ZONE } from './periods.js';

export interface UserFacts {
  totals: Partial<Record<ActivityKind, number>>;
  keys: { activity: ActivityKind; key: string }[];
}

/** Sources de jet reprises : toutes sauf `api`. */
const BACKFILL_ROLL_SOURCES = ['3d', 'mixed', 'free', 'action', 'import'];

/**
 * Paramètres d'une requête : `$1` uuid[] des joueurs (null : tous), puis pour
 * les jets `$2` les sources reprises, et pour les séances `$3` le fuseau.
 */
type Params = 'users' | 'rolls' | 'sessions';

/** Requêtes « un total par joueur ». */
const TOTALS: { kind: ActivityKind; params: Params; sql: string }[] = [
  {
    kind: 'character_created',
    params: 'users',
    sql: `select owner_id as user_id, count(*) as n from characters.characters
           where kind = 'pc' and deleted_at is null and ($1::uuid[] is null or owner_id = any($1))
           group by owner_id`,
  },
  {
    kind: 'campaign_created',
    params: 'users',
    sql: `select user_id, count(*) as n from campaign.campaign_members
           where role = 'gm' and ($1::uuid[] is null or user_id = any($1)) group by user_id`,
  },
  {
    kind: 'session_scheduled',
    params: 'users',
    sql: `select created_by as user_id, count(*) as n from campaign.campaign_sessions
           where $1::uuid[] is null or created_by = any($1) group by created_by`,
  },
  {
    kind: 'chat_message',
    params: 'users',
    sql: `select author_id as user_id, count(*) as n from campaign.campaign_messages
           where $1::uuid[] is null or author_id = any($1) group by author_id`,
  },
  {
    kind: 'note_written',
    params: 'users',
    sql: `select owner_user_id as user_id, count(*) as n from campaign.notes
           where $1::uuid[] is null or owner_user_id = any($1) group by owner_user_id`,
  },
  {
    kind: 'dice_roll',
    params: 'rolls',
    sql: `select author_id as user_id, count(*) as n from dice.rolls
           where author_id is not null and source = any($2::text[])
             and ($1::uuid[] is null or author_id = any($1))
           group by author_id`,
  },
  {
    // Séance jouée : couples campagne-jour (Paris) distincts de ses jets et messages
    kind: 'session_played',
    params: 'sessions',
    sql: `select user_id, count(*) as n from (
            select author_id as user_id, campaign_id, (created_at at time zone $3)::date as day
              from dice.rolls
             where author_id is not null and campaign_id is not null and source = any($2::text[])
            union
            select author_id, campaign_id, (created_at at time zone $3)::date
              from campaign.campaign_messages) s
           where $1::uuid[] is null or user_id = any($1)
           group by user_id`,
  },
];

/** Requêtes « une clé par ligne » : activités uniques déjà acquises. */
const KEYS: { kind: ActivityKind; sql: string }[] = [
  {
    kind: 'campaign_joined',
    sql: `select user_id, campaign_id::text as key from campaign.campaign_members
           where role = 'player' and ($1::uuid[] is null or user_id = any($1))`,
  },
  {
    kind: 'friend_added',
    sql: `select user_a as user_id, user_b::text as key from identity.friendships
           where $1::uuid[] is null or user_a = any($1)
          union all
          select user_b, user_a::text from identity.friendships
           where $1::uuid[] is null or user_b = any($1)`,
  },
];

const PROFILES = `select user_id, time_spent_minutes as minutes,
                         (avatar_url is not null or bio is not null) as complete
                    from identity.profiles
                   where $1::uuid[] is null or user_id = any($1)`;

function factsOf(facts: Map<string, UserFacts>, userId: string): UserFacts {
  let f = facts.get(userId);
  if (!f) facts.set(userId, (f = { totals: {}, keys: [] }));
  return f;
}

/** Faits de chaque joueur (tous, ou seulement `userIds`), lus sur la connexion source. */
export async function readFacts(
  source: Pool,
  userIds: string[] | null = null,
): Promise<Map<string, UserFacts>> {
  const facts = new Map<string, UserFacts>();
  const params: Record<Params, unknown[]> = {
    users: [userIds],
    rolls: [userIds, BACKFILL_ROLL_SOURCES],
    sessions: [userIds, BACKFILL_ROLL_SOURCES, TIME_ZONE],
  };

  for (const q of TOTALS) {
    const { rows } = await source.query<{ user_id: string; n: string }>(q.sql, params[q.params]);
    for (const r of rows) factsOf(facts, r.user_id).totals[q.kind] = Number(r.n);
  }
  for (const q of KEYS) {
    const { rows } = await source.query<{ user_id: string; key: string }>(q.sql, [userIds]);
    for (const r of rows) {
      const f = factsOf(facts, r.user_id);
      f.keys.push({ activity: q.kind, key: r.key });
      f.totals[q.kind] = (f.totals[q.kind] ?? 0) + 1;
    }
  }
  // time_spent_minutes est un bigint : pg le rend en texte
  const { rows } = await source.query<{ user_id: string; minutes: string; complete: boolean }>(
    PROFILES,
    [userIds],
  );
  for (const r of rows) {
    const f = factsOf(facts, r.user_id);
    const minutes = Number(r.minutes);
    if (minutes > 0) f.totals.play_minutes = minutes;
    if (r.complete) {
      f.totals.profile_completed = 1;
      f.keys.push({ activity: 'profile_completed', key: 'once' });
    }
  }
  return facts;
}

export interface BackfillReport {
  users: number;
  missing: number;
  counters: number;
  challenges: number;
  levels: Record<number, number>;
}

/** Applique les faits, un joueur par transaction. Rejouable sans risque. */
export async function applyFacts(
  db: Db,
  facts: Map<string, UserFacts>,
  onUser?: (userId: string, r: BackfillResult | null) => void,
): Promise<BackfillReport> {
  const report: BackfillReport = {
    users: 0,
    missing: 0,
    counters: 0,
    challenges: 0,
    levels: {},
  };
  const ctx = { correlationId: `progression-backfill-${uuidv7()}` };
  for (const [userId, f] of [...facts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const r = await db.transaction((tx) => backfillUserInTx(tx, ctx, userId, f.totals, f.keys));
    onUser?.(userId, r);
    if (!r) {
      report.missing += 1;
      continue;
    }
    report.users += 1;
    report.counters += r.counters;
    report.challenges += r.completed.length;
    report.levels[r.level] = (report.levels[r.level] ?? 0) + 1;
  }
  return report;
}
