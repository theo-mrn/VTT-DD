/**
 * Progression du compte (docs/progression.md) : enregistrement des activités
 * dans la transaction de l'appelant (consommateur, reprise de l'existant) et
 * lecture pour l'écran et l'export.
 *
 * Toute écriture commence par verrouiller la ligne account_progress du joueur :
 * les écritures d'un même joueur sont sérialisées, les plafonds du jour et les
 * accomplissements de défis se calculent sans course.
 */
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import {
  accountProgress,
  profiles,
  progressionChallenges,
  progressionCounters,
  progressionDaily,
  progressionKeys,
  users,
} from '../../db/schema.js';
import { catalogue } from '../titres/catalogue.js';
import { unlockTitleInTx } from '../titres/service.js';
import type { Activity } from './activities.js';
import {
  activeChallenges,
  CHALLENGES,
  nextSteps,
  PERMANENT_CHALLENGES,
  PERMANENT_PERIOD,
  touches,
  type ChallengeDefinition,
  type ChallengeGroup,
  type ChallengeKind,
} from './challenges.js';
import {
  bordersForLevel,
  legacyLevelForMinutes,
  LEVEL_REWARDS,
  levelForXp,
  nextReward,
  rewardsBetween,
  xpForLevel,
  type RewardType,
} from './levels.js';
import { addDays, isoWeek, parisDay, periodsAt, weekDays } from './periods.js';
import { ACTIVITY_KINDS, cappedXp, type ActivityKind } from './rules.js';

/** Détail par jour conservé (docs/progression.md § 10). */
export const DAILY_KEPT_DAYS = 90;

const acteur = (userId: string) => ({ userId, role: 'user' as const, characterId: null });
const compte = (userId: string) => ({ type: 'user', id: userId });

interface Progress {
  xp: number;
  level: number;
}

/** Niveau d'avant d'un compte (temps de jeu gardé en base), null si le profil n'existe pas. */
async function legacyStart(tx: Tx | Db, userId: string): Promise<Progress | null> {
  const [p] = await tx
    .select({ minutes: profiles.timeSpentMinutes })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  if (!p) return null;
  const level = legacyLevelForMinutes(p.minutes);
  return { level, xp: xpForLevel(level) };
}

/**
 * Crée la ligne de progression au premier besoin, au niveau d'avant (docs/progression.md § 9) :
 * l'XP de ce niveau, les titres des paliers déjà atteints, et les Premiers pas tenus pour faits
 * quand le joueur a déjà joué (niveau 2 au moins). Sans XP ajoutée ni notification de niveau.
 * Automatique, au premier événement ou au premier affichage : aucune reprise à lancer.
 */
async function ensureProgress(tx: Tx, ctx: EventContext, userId: string): Promise<void> {
  const start = await legacyStart(tx, userId);
  if (!start) return;
  const created = await tx
    .insert(accountProgress)
    .values({ userId, xp: start.xp, level: start.level })
    .onConflictDoNothing()
    .returning({ level: accountProgress.level });
  if (created.length === 0 || start.level <= 1) return;
  for (const r of rewardsBetween(1, start.level))
    if (r.type === 'title') await unlockTitleInTx(tx, ctx, userId, r.id, 'level');
  const firstSteps = PERMANENT_CHALLENGES.filter((c) => c.group === 'first_steps');
  if (firstSteps.length)
    await tx
      .insert(progressionChallenges)
      .values(
        firstSteps.map((c) => ({ userId, challengeId: c.id, period: PERMANENT_PERIOD, xp: 0 })),
      )
      .onConflictDoNothing();
}

/** Crée au besoin (niveau d'avant) puis verrouille la ligne de progression du joueur. */
async function lockProgress(tx: Tx, ctx: EventContext, userId: string): Promise<Progress> {
  await ensureProgress(tx, ctx, userId);
  const [row] = await tx
    .select({ xp: accountProgress.xp, level: accountProgress.level })
    .from(accountProgress)
    .where(eq(accountProgress.userId, userId))
    .for('update');
  return row!;
}

async function userExists(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId));
  return !!row;
}

async function profileComplete(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ avatarUrl: profiles.avatarUrl, bio: profiles.bio })
    .from(profiles)
    .where(eq(profiles.userId, userId));
  return !!row && (!!row.avatarUrl || !!row.bio);
}

/** Vrai si la clé est nouvelle (et la note), faux si l'activité est déjà comptée. */
async function claimKey(tx: Tx, userId: string, activity: ActivityKind, key: string) {
  const fresh = await tx
    .insert(progressionKeys)
    .values({ userId, activity, key })
    .onConflictDoNothing()
    .returning({ key: progressionKeys.key });
  return fresh.length > 0;
}

/** Ajoute des unités (jour et vie entière) ; renvoie l'XP gagnée après plafond. */
async function addUnits(
  tx: Tx,
  userId: string,
  day: string,
  kind: ActivityKind,
  units: number,
): Promise<number> {
  const [today] = await tx
    .select({ xp: progressionDaily.xp })
    .from(progressionDaily)
    .where(
      and(
        eq(progressionDaily.userId, userId),
        eq(progressionDaily.day, day),
        eq(progressionDaily.activity, kind),
      ),
    );
  const xp = cappedXp(kind, units, today?.xp ?? 0);
  await tx
    .insert(progressionDaily)
    .values({ userId, day, activity: kind, units, xp })
    .onConflictDoUpdate({
      target: [progressionDaily.userId, progressionDaily.day, progressionDaily.activity],
      set: {
        units: sql`${progressionDaily.units} + excluded.units`,
        xp: sql`${progressionDaily.xp} + excluded.xp`,
      },
    });
  await tx
    .insert(progressionCounters)
    .values({ userId, activity: kind, total: units })
    .onConflictDoUpdate({
      target: [progressionCounters.userId, progressionCounters.activity],
      set: { total: sql`${progressionCounters.total} + excluded.total` },
    });
  return xp;
}

async function unitsOnDays(
  tx: Tx | Db,
  userId: string,
  days: string[],
  kinds: readonly ActivityKind[],
): Promise<number> {
  const [row] = await tx
    .select({ units: sql<string>`coalesce(sum(${progressionDaily.units}), 0)` })
    .from(progressionDaily)
    .where(
      and(
        eq(progressionDaily.userId, userId),
        inArray(progressionDaily.day, days),
        inArray(progressionDaily.activity, [...kinds]),
      ),
    );
  return Number(row?.units ?? 0);
}

async function lifetimeUnits(
  tx: Tx | Db,
  userId: string,
  kinds: readonly ActivityKind[],
): Promise<number> {
  const [row] = await tx
    .select({ units: sql<string>`coalesce(sum(${progressionCounters.total}), 0)` })
    .from(progressionCounters)
    .where(
      and(
        eq(progressionCounters.userId, userId),
        inArray(progressionCounters.activity, [...kinds]),
      ),
    );
  return Number(row?.units ?? 0);
}

export interface CompletedChallenge {
  id: string;
  kind: ChallengeKind;
  period: string;
  xp: number;
}

/**
 * Accomplit les défis du jour `day` (quotidiens, hebdomadaires de sa semaine,
 * permanents) qui avancent avec `touched` et dont la cible est atteinte ; chaque
 * défi n'est récompensé qu'une fois par période. Écrit leurs événements.
 */
async function completeChallenges(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  day: string,
  touched: ReadonlySet<ActivityKind>,
  scope: 'all' | 'permanent' = 'all',
): Promise<CompletedChallenge[]> {
  const week = isoWeek(day);
  const rotating = scope === 'all';
  const candidates: { c: ChallengeDefinition; period: string; progress: () => Promise<number> }[] =
    [
      ...(rotating ? activeChallenges(userId, 'daily', day) : []).map((c) => ({
        c,
        period: day,
        progress: () => unitsOnDays(tx, userId, [day], c.activities),
      })),
      ...(rotating ? activeChallenges(userId, 'weekly', week) : []).map((c) => ({
        c,
        period: week,
        progress: () => unitsOnDays(tx, userId, weekDays(day), c.activities),
      })),
      ...PERMANENT_CHALLENGES.map((c) => ({
        c,
        period: PERMANENT_PERIOD,
        progress: () => lifetimeUnits(tx, userId, c.activities),
      })),
    ].filter(({ c }) => touches(c, touched));

  const completed: CompletedChallenge[] = [];
  for (const { c, period, progress } of candidates) {
    if ((await progress()) < c.target) continue;
    const fresh = await tx
      .insert(progressionChallenges)
      .values({ userId, challengeId: c.id, period, xp: c.xp })
      .onConflictDoNothing()
      .returning({ id: progressionChallenges.challengeId });
    if (fresh.length === 0) continue;
    completed.push({ id: c.id, kind: c.kind, period, xp: c.xp });
    await appendEvent(tx, ctx, {
      type: 'identity.challenge_completed',
      actor: acteur(userId),
      aggregate: compte(userId),
      visibility: 'owner',
      payload: { challengeId: c.id, kind: c.kind, period, xp: c.xp },
    });
  }
  return completed;
}

/**
 * Ajoute `gained` XP au joueur (ligne déjà verrouillée) ; à un passage de
 * niveau, débloque les titres des paliers franchis et écrit un seul
 * identity.level_reached.
 */
async function applyXp(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  before: Progress,
  gained: number,
): Promise<Progress> {
  if (gained <= 0) return before;
  const xp = before.xp + gained;
  // Le niveau ne baisse jamais, même si la courbe changeait
  const level = Math.max(before.level, levelForXp(xp));
  await tx
    .update(accountProgress)
    .set({ xp, level, updatedAt: sql`now()` })
    .where(eq(accountProgress.userId, userId));
  if (level > before.level) {
    const rewards = rewardsBetween(before.level, level);
    for (const r of rewards) {
      if (r.type === 'title') await unlockTitleInTx(tx, ctx, userId, r.id, 'level');
    }
    await appendEvent(tx, ctx, {
      type: 'identity.level_reached',
      actor: acteur(userId),
      aggregate: compte(userId),
      visibility: 'owner',
      payload: {
        level,
        previousLevel: before.level,
        xp,
        rewards: rewards.map((r) => ({ level: r.level, type: r.type, id: r.id })),
      },
    });
  }
  return { xp, level };
}

export interface RecordResult {
  xpGained: number;
  levelBefore: number;
  level: number;
  completed: CompletedChallenge[];
}

/**
 * Enregistre les activités d'un joueur survenues à l'instant `at`, dans la
 * transaction de l'appelant. Null si le compte n'existe pas (supprimé).
 */
export async function recordActivitiesInTx(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  activities: readonly Activity[],
  at: Date,
): Promise<RecordResult | null> {
  if (!(await userExists(tx, userId))) return null;
  const before = await lockProgress(tx, ctx, userId);
  const day = parisDay(at);

  let gained = 0;
  const touched = new Set<ActivityKind>();
  for (const a of activities) {
    if (a.units <= 0) continue;
    if (a.condition === 'profile_complete' && !(await profileComplete(tx, userId))) continue;
    if (a.key !== undefined && !(await claimKey(tx, userId, a.kind, a.key))) continue;
    gained += await addUnits(tx, userId, day, a.kind, a.units);
    touched.add(a.kind);
  }
  if (touched.size === 0)
    return { xpGained: 0, levelBefore: before.level, level: before.level, completed: [] };

  const completed = await completeChallenges(tx, ctx, userId, day, touched);
  gained += completed.reduce((sum, c) => sum + c.xp, 0);
  const after = await applyXp(tx, ctx, userId, before, gained);
  return { xpGained: gained, levelBefore: before.level, level: after.level, completed };
}

// ─── Reprise de l'existant (docs/progression.md § 9) ─────────────────────────

export interface BackfillResult {
  counters: number;
  completed: CompletedChallenge[];
  level: number;
}

/**
 * Facultatif : relève les compteurs à vie d'un joueur depuis les autres services (jamais
 * baissés) et accomplit les défis permanents atteints. Rejouable. Le niveau, lui, n'en dépend
 * pas : il part du niveau d'avant, automatiquement (`ensureProgress`).
 */
export async function backfillUserInTx(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  totals: Partial<Record<ActivityKind, number>>,
  keys: readonly { activity: ActivityKind; key: string }[],
): Promise<BackfillResult | null> {
  if (!(await userExists(tx, userId))) return null;
  const before = await lockProgress(tx, ctx, userId);

  const touched = new Set<ActivityKind>();
  let counters = 0;
  for (const [kind, total] of Object.entries(totals) as [ActivityKind, number][]) {
    if (!ACTIVITY_KINDS.includes(kind) || !(total > 0)) continue;
    const raised = await tx
      .insert(progressionCounters)
      .values({ userId, activity: kind, total: Math.floor(total) })
      .onConflictDoUpdate({
        target: [progressionCounters.userId, progressionCounters.activity],
        set: { total: sql`greatest(${progressionCounters.total}, excluded.total)` },
        setWhere: sql`${progressionCounters.total} < excluded.total`,
      })
      .returning({ total: progressionCounters.total });
    if (raised.length) counters += 1;
    touched.add(kind);
  }
  // Clés déjà acquises (profil complété, amis, campagnes rejointes) : un nouvel événement
  // pour la même chose ne rapportera rien
  for (const k of keys) await claimKey(tx, userId, k.activity, k.key);

  // Seuls les permanents : les quotidiens et hebdomadaires ne sont pas repris
  const completed = await completeChallenges(
    tx,
    ctx,
    userId,
    parisDay(new Date()),
    touched,
    'permanent',
  );

  const gained = completed.reduce((sum, c) => sum + c.xp, 0);
  const after = await applyXp(tx, ctx, userId, before, gained);
  return { counters, completed, level: after.level };
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

export interface ChallengeView {
  id: string;
  kind: ChallengeKind;
  group: ChallengeGroup | null;
  label: string;
  target: number;
  progress: number;
  xp: number;
  completed: boolean;
}

export interface RewardView {
  level: number;
  type: RewardType;
  id: string;
  /** Libellé du titre ; null pour une bordure (le front a ses libellés). */
  label: string | null;
  reached: boolean;
}

export interface ProgressionView {
  level: number;
  xp: number;
  /** XP cumulée au début du niveau et au niveau suivant. */
  levelXp: number;
  nextLevelXp: number;
  todayXp: number;
  rewards: RewardView[];
  nextReward: RewardView | null;
  borders: string[];
  challenges: { daily: ChallengeView[]; weekly: ChallengeView[]; permanent: ChallengeView[] };
  steps: ChallengeView[];
  periods: { day: string; week: string; dailyEndsAt: string; weeklyEndsAt: string };
}

const titleLabels = new Map(catalogue().map((t) => [t.slug, t.label]));

function rewardView(r: (typeof LEVEL_REWARDS)[number], level: number): RewardView {
  return {
    level: r.level,
    type: r.type,
    id: r.id,
    label: r.type === 'title' ? (titleLabels.get(r.id) ?? null) : null,
    reached: r.level <= level,
  };
}

/** Niveau du compte (1 sans progression). */
export async function levelOf(tx: Tx | Db, userId: string): Promise<number> {
  const [row] = await tx
    .select({ level: accountProgress.level })
    .from(accountProgress)
    .where(eq(accountProgress.userId, userId));
  return row?.level ?? (await legacyStart(tx, userId))?.level ?? 1;
}

/** Progression affichée au joueur à l'instant `now`. */
export async function readProgression(
  db: Db,
  userId: string,
  now: Date = new Date(),
  ctx: EventContext = { correlationId: crypto.randomUUID() },
): Promise<ProgressionView> {
  // Premier affichage : le compte démarre à son niveau d'avant
  await db.transaction((tx) => ensureProgress(tx, ctx, userId));
  const periods = periodsAt(now);
  const days = weekDays(periods.day);
  const [[progress], dailyRows, counterRows, completions] = await Promise.all([
    db
      .select({ xp: accountProgress.xp, level: accountProgress.level })
      .from(accountProgress)
      .where(eq(accountProgress.userId, userId)),
    db
      .select({
        day: progressionDaily.day,
        activity: progressionDaily.activity,
        units: progressionDaily.units,
        xp: progressionDaily.xp,
      })
      .from(progressionDaily)
      .where(and(eq(progressionDaily.userId, userId), inArray(progressionDaily.day, days))),
    db
      .select({ activity: progressionCounters.activity, total: progressionCounters.total })
      .from(progressionCounters)
      .where(eq(progressionCounters.userId, userId)),
    db
      .select({ id: progressionChallenges.challengeId, period: progressionChallenges.period })
      .from(progressionChallenges)
      .where(
        and(
          eq(progressionChallenges.userId, userId),
          inArray(progressionChallenges.period, [periods.day, periods.week, PERMANENT_PERIOD]),
        ),
      ),
  ]);
  const xp = progress?.xp ?? 0;
  const level = progress?.level ?? 1;
  const done = new Set(completions.map((c) => `${c.id}@${c.period}`));

  const sum = (rows: { activity: string; units: number }[], kinds: readonly string[]) =>
    rows.filter((r) => kinds.includes(r.activity)).reduce((s, r) => s + r.units, 0);
  const today = dailyRows.filter((r) => r.day === periods.day);
  const lifetime = counterRows.map((r) => ({ activity: r.activity, units: r.total }));

  const view = (c: ChallengeDefinition, period: string, progressValue: number): ChallengeView => {
    const completed = done.has(`${c.id}@${period}`);
    return {
      id: c.id,
      kind: c.kind,
      group: c.group ?? null,
      label: c.label,
      target: c.target,
      progress: completed ? c.target : Math.min(c.target, progressValue),
      xp: c.xp,
      completed,
    };
  };

  const permanent = PERMANENT_CHALLENGES.map((c) =>
    view(c, PERMANENT_PERIOD, sum(lifetime, c.activities)),
  );
  const steps = nextSteps(
    permanent.map((v) => ({
      challenge: CHALLENGES.find((c) => c.id === v.id)!,
      progress: v.progress,
      completed: v.completed,
    })),
  ).map((s) => permanent.find((v) => v.id === s.challenge.id)!);
  const next = nextReward(level);

  return {
    level,
    xp,
    levelXp: xpForLevel(level),
    nextLevelXp: xpForLevel(level + 1),
    todayXp: today.reduce((s, r) => s + r.xp, 0),
    rewards: LEVEL_REWARDS.map((r) => rewardView(r, level)),
    nextReward: next ? rewardView(next, level) : null,
    borders: bordersForLevel(level),
    challenges: {
      daily: activeChallenges(userId, 'daily', periods.day).map((c) =>
        view(c, periods.day, sum(today, c.activities)),
      ),
      weekly: activeChallenges(userId, 'weekly', periods.week).map((c) =>
        view(c, periods.week, sum(dailyRows, c.activities)),
      ),
      permanent,
    },
    steps,
    periods: {
      day: periods.day,
      week: periods.week,
      dailyEndsAt: periods.dailyEndsAt.toISOString(),
      weeklyEndsAt: periods.weeklyEndsAt.toISOString(),
    },
  };
}

export interface ProgressionHistory {
  xp: number;
  level: number;
  daily: { day: string; activity: string; units: number; xp: number }[];
  counters: { activity: string; total: number }[];
  challenges: { challengeId: string; period: string; xp: number; completedAt: string }[];
}

/** Tout ce que la progression garde d'un joueur (export des données). */
export async function readProgressionHistory(db: Db, userId: string): Promise<ProgressionHistory> {
  const [[progress], daily, counters, challenges] = await Promise.all([
    db
      .select({ xp: accountProgress.xp, level: accountProgress.level })
      .from(accountProgress)
      .where(eq(accountProgress.userId, userId)),
    db
      .select({
        day: progressionDaily.day,
        activity: progressionDaily.activity,
        units: progressionDaily.units,
        xp: progressionDaily.xp,
      })
      .from(progressionDaily)
      .where(eq(progressionDaily.userId, userId))
      .orderBy(desc(progressionDaily.day), asc(progressionDaily.activity)),
    db
      .select({ activity: progressionCounters.activity, total: progressionCounters.total })
      .from(progressionCounters)
      .where(eq(progressionCounters.userId, userId))
      .orderBy(asc(progressionCounters.activity)),
    db
      .select({
        challengeId: progressionChallenges.challengeId,
        period: progressionChallenges.period,
        xp: progressionChallenges.xp,
        completedAt: progressionChallenges.completedAt,
      })
      .from(progressionChallenges)
      .where(eq(progressionChallenges.userId, userId))
      .orderBy(desc(progressionChallenges.completedAt)),
  ]);
  return {
    xp: progress?.xp ?? 0,
    level: progress?.level ?? 1,
    daily,
    counters,
    challenges: challenges.map((c) => ({ ...c, completedAt: c.completedAt.toISOString() })),
  };
}

/** Purge le détail par jour au-delà de DAILY_KEPT_DAYS. Renvoie le nombre de lignes. */
export async function purgeProgressionDaily(db: Db, now: Date = new Date()): Promise<number> {
  const before = addDays(parisDay(now), -DAILY_KEPT_DAYS);
  const rows = await db
    .delete(progressionDaily)
    .where(lt(progressionDaily.day, before))
    .returning({ userId: progressionDaily.userId });
  return rows.length;
}
