/**
 * Recherche d'emoji en français (mots-clés CLDR, emoji-keywords.ts) : chaque mot tapé doit
 * commencer un mot d'un mot-clé, accents et majuscules ignorés. Les emoji dont le nom commence
 * par la recherche viennent d'abord, puis ceux dont un mot-clé commence par elle.
 */
export const normalizeSearch = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function searchEmoji(
  index: Readonly<Record<string, string>>,
  query: string,
  limit = 180,
): string[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const tokens = q.split(/\s+/);
  const scored: { emoji: string; score: number; order: number }[] = [];
  let order = 0;
  for (const [emoji, raw] of Object.entries(index)) {
    order += 1;
    const keywords = raw.split('|');
    const words = keywords.flatMap((k) => k.split(/[\s:’'-]+/));
    if (!tokens.every((t) => words.some((w) => w.startsWith(t)))) continue;
    const score = keywords[0]!.startsWith(q) ? 0 : keywords.some((k) => k.startsWith(q)) ? 1 : 2;
    scored.push({ emoji, score, order });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.emoji);
}
