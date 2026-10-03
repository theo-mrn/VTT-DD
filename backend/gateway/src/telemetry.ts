/**
 * Relais OTLP du navigateur (docs/observabilite.md § 4) : traces et logs du front arrivent ici,
 * sur la même origine que l'app, et repartent tels quels vers le collecteur. Aucun collecteur
 * n'est exposé sur Internet. Sans collecteur configuré, l'envoi est accepté puis jeté.
 *
 * Routes publiques (une erreur de la page de connexion doit remonter), donc bornées : 256 Kio
 * par envoi, débit limité par adresse IP. Le nom de service est imposé (`web`) : un navigateur ne
 * peut pas se faire passer pour un service du back.
 */
import type { FastifyBaseLogger, FastifyInstance, RawServerDefault } from 'fastify';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const TELEMETRY_SIGNALS = ['traces', 'logs'] as const;
const BODY_LIMIT = 256 * 1024;
const FORWARD_TIMEOUT_MS = 5_000;
export const BROWSER_SERVICE_NAME = 'web';

type OtlpResource = { attributes?: { key: string; value: unknown }[] };
type OtlpBody = Record<string, { resource?: OtlpResource }[] | undefined>;

/** Impose `service.name = web` sur chaque ressource du lot OTLP/JSON. */
export function forceBrowserService(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  for (const list of Object.values(body as OtlpBody)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') continue;
      const resource = (entry.resource ??= {});
      const attributes = (resource.attributes ?? []).filter((a) => a?.key !== 'service.name');
      attributes.push({ key: 'service.name', value: { stringValue: BROWSER_SERVICE_NAME } });
      resource.attributes = attributes;
    }
  }
  return body;
}

export async function telemetryRoutes<L extends FastifyBaseLogger>(
  app: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, L>,
  o: { endpoint?: string | undefined; fetch?: typeof globalThis.fetch },
) {
  const target = o.endpoint?.replace(/\/$/, '');
  const send = o.fetch ?? globalThis.fetch;
  for (const signal of TELEMETRY_SIGNALS) {
    app.post(
      `/v1/telemetry/${signal}`,
      { bodyLimit: BODY_LIMIT, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
      async (req, reply) => {
        if (!req.headers['content-type']?.startsWith('application/json')) {
          return reply.code(415).send();
        }
        if (!target) return reply.code(204).send();
        // Jamais d'erreur renvoyée au navigateur : la télémétrie ne doit rien casser
        const res = await send(`${target}/v1/${signal}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(forceBrowserService(req.body)),
          signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
        }).catch((err: unknown) => {
          req.log.warn(
            { error: (err as Error).message, signal },
            'télémétrie : collecteur injoignable',
          );
          return null;
        });
        if (res && !res.ok)
          req.log.warn({ status: res.status, signal }, 'télémétrie : envoi refusé');
        return reply.code(204).send();
      },
    );
  }
}
