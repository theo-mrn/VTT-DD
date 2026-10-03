import Fastify from 'fastify';
import { appendEvent } from './outbox.js';
import { helpers, makeRepo, save } from './repository.js';

const app = Fastify();
const r = app.withTypeProvider();
const repo = makeRepo();
const base = '/v1/things';

/** Faux client HTTP : `.post` n'est pas une route. */
const client = { post: (url: string, body: unknown) => ({ url, body }) };
client.post('/v1/not-a-route', {});

r.post('/v1/direct', async () => {
  await appendEvent('direct');
});

r.put('/v1/chain/:id', {}, async () => save('x'));

r.patch(`${base}/:id`, async () => {
  // Helper local qui reçoit un rappel, comme modifierPour → modifier → enregistrer
  const update = async (compute: () => string) => save(compute());
  return update(() => 'y');
});

r.delete('/v1/factory/:id', async () => repo.remove('id'));

r.post('/v1/quiet', async () => repo.touch('id'));

r.post('/v1/neighbour', async () => helpers.quiet(' x '));

app.get('/v1/read', async () => appendEvent('lecture'));

for (const kind of ['a', 'b']) {
  app.delete(`/v1/layers/${kind}`, { handler: async () => ({ kind }) });
}
