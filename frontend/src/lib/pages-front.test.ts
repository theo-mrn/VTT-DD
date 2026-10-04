/**
 * Le backend envoie vers ces pages (liens des e-mails, redirections OAuth) : un
 * renommage de route ne doit pas les casser sans bruit. Liste partagée :
 * PAGES_FRONT de @vtt/contracts.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES_FRONT } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';

const APP = fileURLToPath(new URL('../app', import.meta.url));

/** Routes servies par src/app : un page.tsx, chemin sans les groupes « (nom) ». */
function routes(dossier: string, prefixe = ''): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    if (entree.isFile()) return entree.name === 'page.tsx' ? [prefixe || '/'] : [];
    if (!entree.isDirectory()) return [];
    const groupe = entree.name.startsWith('(') && entree.name.endsWith(')');
    return routes(path.join(dossier, entree.name), groupe ? prefixe : `${prefixe}/${entree.name}`);
  });
}

describe('pages du front visées par le backend', () => {
  const existantes = new Set(routes(APP));

  it.each(Object.entries(PAGES_FRONT))('%s (%s) existe', (_nom, chemin) => {
    expect(existantes).toContain(chemin);
  });
});
