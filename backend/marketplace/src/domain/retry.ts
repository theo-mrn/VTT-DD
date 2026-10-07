/** Violation d'unicité Postgres (23505), éventuellement sur une contrainte précise. */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = (e as { cause?: unknown })?.cause ?? e;
  const pg = err as { code?: string; constraint?: string };
  return pg?.code === '23505' && (!constraint || pg.constraint === constraint);
}

/**
 * Rejoue `run` quand deux écritures se disputent la même adresse lisible (unicité du slug) :
 * la seconde recalcule une adresse libre.
 */
export async function retryOnSlugConflict<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i += 1) {
    try {
      return await run();
    } catch (e) {
      const slugConflict =
        isUniqueViolation(e, 'listings_slug_unique') ||
        isUniqueViolation(e, 'creators_slug_unique');
      if (!slugConflict || i >= attempts) throw e;
    }
  }
}
