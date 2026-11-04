/**
 * Lieux retirés de la bibliothèque (hors sujet : moderne, abstrait, pas un lieu), par source :
 * `excluded.json` (`{ "<source>": { "<clé>": "raison" } }`), tenu par `run remove`. L'import ne
 * les remet jamais.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

const FILE = new URL('./excluded.json', import.meta.url);
const Excluded = z.record(z.string(), z.record(z.string(), z.string()));
export type Excluded = z.infer<typeof Excluded>;

export function readExcluded(): Excluded {
  return Excluded.parse(JSON.parse(readFileSync(FILE, 'utf8')));
}

export function writeExcluded(e: Excluded) {
  // Trié : une liste stable, lisible dans un diff
  const sorted = Object.fromEntries(
    Object.keys(e)
      .sort()
      .map((s) => [
        s,
        Object.fromEntries(Object.entries(e[s]!).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );
  writeFileSync(FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}
