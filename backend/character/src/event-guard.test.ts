/**
 * Garde-fou du tunnel d'historique (docs/refacto.md, docs/bus.md) : chaque
 * route d'écriture publique (POST, PUT, PATCH, DELETE hors /internal) doit
 * pouvoir écrire un événement dans l'outbox (`appendEvent`), directement ou via
 * ses helpers (`modifierPour` → `modifier` → `enregistrer`). Analyse statique
 * par le vérificateur de types (@vtt/platform/testing), sans base de données.
 *
 * Une route qui n'écrit rien doit figurer dans EXCEPTIONS avec sa raison.
 */
import { fileURLToPath } from 'node:url';
import { findWriteRoutes, routeKey, type WriteRoute } from '@vtt/platform/testing';
import { beforeAll, describe, expect, it } from 'vitest';

/** Routes d'écriture sans événement, et pourquoi. */
const EXCEPTIONS: Record<string, string> = {
  'POST /v1/characters/:id/uploads':
    'billet d’envoi signé : le fichier n’est rattaché qu’au PATCH du portrait, qui émet',
  'POST /v1/characters/:id/uploads/import':
    'copie d’une image distante sur le stockage : rattachée ensuite par le PATCH du portrait',
  'POST /v1/characters/import/link':
    'lecture d’une fiche en ligne, sans rien écrire : la création importée émet (character.created)',
};

describe('garde-fou : chaque route d’écriture émet un événement', () => {
  let routes: WriteRoute[] = [];
  const publiques = () => routes.filter((r) => !r.url.startsWith('/internal/'));

  beforeAll(() => {
    routes = findWriteRoutes({
      tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
      emitters: [{ file: 'src/db/outbox.ts', name: 'appendEvent' }],
      exclude: (f) => f.startsWith('src/test/'),
    });
  }, 60_000);

  it('trouve les routes et suit les helpers', () => {
    expect(publiques().length).toBeGreaterThanOrEqual(14);
    const patch = routes.find((r) => routeKey(r) === 'PATCH /v1/characters/:id');
    expect(patch?.emitPath).toEqual(['modifierPour', 'modifier', 'enregistrer', 'appendEvent']);
  });

  it('chaque route publique émet un événement ou est une exception justifiée', () => {
    const manquantes = publiques()
      .filter((r) => r.emitPath.length === 0 && !(routeKey(r) in EXCEPTIONS))
      .map((r) => `${routeKey(r)} (${r.location})`);
    expect(manquantes).toEqual([]);
  });

  it('chaque exception désigne une route existante qui n’émet rien', () => {
    for (const cle of Object.keys(EXCEPTIONS)) {
      const route = routes.find((r) => routeKey(r) === cle);
      expect(route, cle).toBeDefined();
      expect(route!.emitPath, cle).toEqual([]);
    }
  });
});
