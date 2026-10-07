/**
 * Jours et semaines de la progression : ceux de Paris (docs/progression.md § 2).
 * Un jour s'écrit AAAA-MM-JJ, une semaine ISO AAAA-Www (lundi au dimanche).
 */

export const TIME_ZONE = 'Europe/Paris';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const DAY_MS = 86_400_000;

/** Jour de Paris d'un instant, AAAA-MM-JJ. */
export function parisDay(at: Date): string {
  return dayFormat.format(at);
}

function utcOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function dayOfUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Jour décalé de `n` jours. */
export function addDays(day: string, n: number): string {
  return dayOfUtc(utcOf(day) + n * DAY_MS);
}

/** Lundi de la semaine du jour. */
export function mondayOf(day: string): string {
  const dow = new Date(utcOf(day)).getUTCDay(); // 0 = dimanche
  return addDays(day, -((dow + 6) % 7));
}

/** Les sept jours (lundi → dimanche) de la semaine du jour. */
export function weekDays(day: string): string[] {
  const monday = mondayOf(day);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Semaine ISO 8601 du jour, AAAA-Www (l'année est celle du jeudi de la semaine). */
export function isoWeek(day: string): string {
  const thursday = addDays(mondayOf(day), 3);
  const year = Number(thursday.slice(0, 4));
  const week = Math.floor((utcOf(thursday) - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Instant de minuit à Paris au début du jour (heure d'hiver UTC+1, d'été UTC+2). */
export function parisMidnight(day: string): Date {
  for (const offset of [1, 2]) {
    const at = new Date(utcOf(day) - offset * 3_600_000);
    if (parisDay(at) === day && timeFormat.format(at) === '00:00') return at;
  }
  // Jamais atteint pour Europe/Paris ; repli défensif sur minuit UTC
  return new Date(utcOf(day));
}

/** Périodes en cours à l'instant `at` et leurs fins. */
export function periodsAt(at: Date): {
  day: string;
  week: string;
  dailyEndsAt: Date;
  weeklyEndsAt: Date;
} {
  const day = parisDay(at);
  return {
    day,
    week: isoWeek(day),
    dailyEndsAt: parisMidnight(addDays(day, 1)),
    weeklyEndsAt: parisMidnight(addDays(mondayOf(day), 7)),
  };
}
