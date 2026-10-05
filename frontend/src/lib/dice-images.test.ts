/**
 * Chaque skin du catalogue a ses images pré-calculées : WebP 512 px (boutique) et vignette WebP
 * 128 px (petits affichages). Un dé ajouté sans image : `pnpm --filter @vtt/web dice:bake`.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DICE_SKINS } from '@/components/dice/three/dice-definitions';

const DICE = fileURLToPath(new URL('../../public/dice', import.meta.url));

describe('images des dés', () => {
  it.each(Object.keys(DICE_SKINS))('%s : image et vignette présentes', (skin) => {
    expect(existsSync(`${DICE}/${skin}.webp`), `${skin}.webp manquant : lancer dice:bake`).toBe(
      true,
    );
    expect(existsSync(`${DICE}/thumbs/${skin}.webp`), `thumbs/${skin}.webp manquant`).toBe(true);
  });
});
