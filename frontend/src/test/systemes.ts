import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Systèmes assemblés par @vtt/systemes, que turbo construit avant les tests : les mêmes
 * fichiers que public/systemes, qui n'existe qu'après le build du front.
 */
export const SYSTEMES = `${join(dirname(createRequire(import.meta.url).resolve('@vtt/systemes')), 'systemes')}/`;
