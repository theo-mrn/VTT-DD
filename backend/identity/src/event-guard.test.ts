/**
 * Garde-fou du tunnel d'historique (docs/refacto.md, docs/bus.md) : chaque
 * route d'écriture publique (POST, PUT, PATCH, DELETE hors /internal) doit
 * pouvoir écrire un événement dans l'outbox (`appendEvent`), directement ou via
 * ses helpers (`modifierProfil`, `revoquerFamille`…). Analyse statique
 * par le vérificateur de types (@vtt/platform/testing), sans base de données.
 *
 * Une route qui n'écrit rien doit figurer dans EXCEPTIONS avec sa raison.
 */
import { fileURLToPath } from 'node:url';
import { findWriteRoutes, routeKey, type WriteRoute } from '@vtt/platform/testing';
import { beforeAll, describe, expect, it } from 'vitest';

/** Routes d'écriture sans événement, et pourquoi. */
const EXCEPTIONS: Record<string, string> = {
  'POST /v1/users/me/uploads':
    'Signe une URL d’envoi vers le stockage, rien n’est écrit en base. L’avatar ou la bannière ' +
    'sont enregistrés ensuite par PATCH /v1/users/me, tracé par identity.profile_updated.',
  'POST /v1/auth/refresh':
    'Rotation technique du refresh token (toutes les quelques minutes par client) : bruit sans ' +
    'valeur pour l’historique. Les révocations explicites (logout-all, DELETE sessions/:id) sont tracées.',
  // Manque connu, hors du périmètre du garde-fou : à corriger dans identity
  'POST /v1/auth/logout':
    'MANQUE CONNU : la déconnexion clôt la session sans événement, alors que la connexion émet ' +
    'identity.user_logged_in. À ajouter (identity.user_logged_out) pour un audit des sessions complet.',
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
    expect(publiques().length).toBeGreaterThanOrEqual(20);
    const patch = routes.find((r) => routeKey(r) === 'DELETE /v1/auth/sessions/:id');
    expect(patch?.emitPath).toEqual(['revoquerFamille', 'appendEvent']);
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
