/** Version de schéma de l'archive : la dernière migration d’audio. */
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ARCHIVE_SCHEMA_VERSION } from './tables.js';

describe('ARCHIVE_SCHEMA_VERSION', () => {
  it('suit la dernière migration', () => {
    const dir = fileURLToPath(new URL('../../../db/changes', import.meta.url));
    const last = readdirSync(dir)
      .map((f) => /^(\d{4})-/.exec(f)?.[1])
      .filter((n): n is string => !!n && n !== '9999')
      .sort()
      .at(-1);
    expect(ARCHIVE_SCHEMA_VERSION).toBe(last);
  });
});
