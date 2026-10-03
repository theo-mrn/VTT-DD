import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export type ReadinessCheck = () => Promise<boolean>;

export interface HealthOptions {
  checks: Record<string, ReadinessCheck>;
  timeoutMs?: number;
}

async function withTimeout(check: ReadinessCheck, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      check().catch(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * /healthz : le processus répond (liveness, jamais de dépendance externe).
 * /readyz : les dépendances répondent (readiness) ; passe à 503 pendant
 * l'arrêt pour que Kubernetes retire le pod du Service avant la fermeture.
 */
export const health = fp<HealthOptions>(
  async (app: FastifyInstance, opts) => {
    let shuttingDown = false;
    app.addHook('onClose', async () => {
      shuttingDown = true;
    });
    app.decorate('markShuttingDown', () => {
      shuttingDown = true;
    });

    app.get('/healthz', { logLevel: 'silent' }, async () => ({ status: 'ok' }));

    app.get('/readyz', { logLevel: 'silent' }, async (_req, reply) => {
      if (shuttingDown) return reply.code(503).send({ status: 'shutting_down' });
      const entries = await Promise.all(
        Object.entries(opts.checks).map(
          async ([name, check]) =>
            [name, await withTimeout(check, opts.timeoutMs ?? 2000)] as const,
        ),
      );
      const checks = Object.fromEntries(entries);
      const ok = entries.every(([, v]) => v);
      return reply.code(ok ? 200 : 503).send({ status: ok ? 'ok' : 'degraded', checks });
    });
  },
  { name: 'vtt-health' },
);

declare module 'fastify' {
  interface FastifyInstance {
    markShuttingDown: () => void;
  }
}
