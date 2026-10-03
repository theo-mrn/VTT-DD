import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findWriteRoutes, routeKey } from './write-routes.js';

const tsconfig = fileURLToPath(
  new URL('../../test-fixtures/write-routes/tsconfig.json', import.meta.url),
);

describe('findWriteRoutes', () => {
  const routes = findWriteRoutes({
    tsconfig,
    emitters: [{ file: 'src/outbox.ts', name: 'appendEvent' }],
  });
  const byKey = Object.fromEntries(routes.map((r) => [routeKey(r), r]));

  it('trouve les routes d’écriture Fastify, et seulement elles', () => {
    expect(Object.keys(byKey).sort()).toEqual([
      'DELETE /v1/factory/:id',
      'DELETE /v1/layers/{kind}',
      'PATCH /v1/things/:id',
      'POST /v1/direct',
      'POST /v1/neighbour',
      'POST /v1/quiet',
      'PUT /v1/chain/:id',
    ]);
    expect(byKey['POST /v1/direct']!.location).toBe('src/routes.ts:14');
  });

  it('suit les helpers, les alias d’import, les rappels et les fabriques', () => {
    expect(byKey['POST /v1/direct']!.emitPath).toEqual(['appendEvent']);
    expect(byKey['PUT /v1/chain/:id']!.emitPath).toEqual(['save', 'persist', 'appendEvent']);
    expect(byKey['PATCH /v1/things/:id']!.emitPath).toEqual([
      'update',
      'save',
      'persist',
      'appendEvent',
    ]);
    expect(byKey['DELETE /v1/factory/:id']!.emitPath).toEqual(['remove', 'appendEvent']);
  });

  it('ne compte pas un membre voisin qui émet', () => {
    expect(byKey['POST /v1/quiet']!.emitPath).toEqual([]);
    expect(byKey['POST /v1/neighbour']!.emitPath).toEqual([]);
    expect(byKey['DELETE /v1/layers/{kind}']!.emitPath).toEqual([]);
  });

  it('refuse un émetteur introuvable', () => {
    expect(() =>
      findWriteRoutes({ tsconfig, emitters: [{ file: 'src/outbox.ts', name: 'absent' }] }),
    ).toThrow(/Émetteur introuvable/);
  });
});
