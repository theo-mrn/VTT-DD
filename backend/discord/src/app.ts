/**
 * Service discord : bot de dés (docs/discord.md).
 *
 *   POST /v1/discord/interactions   interactions Discord (commandes, autocomplétion, boutons),
 *                                   relayées sans jeton par la gateway, authentifiées par leur
 *                                   signature Ed25519 sur le corps brut.
 *
 * Discord attend une réponse en moins de 3 s : la route répond tout de suite (réponse différée,
 * mise à jour du plateau, suggestions) et le reste se fait ensuite, par les messages de
 * l'interaction (jeton valable 15 minutes).
 */
import { createService, HttpError, type ServiceOptions } from '@vtt/platform';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import { bot as createBot } from './bot.js';
import type { DiscordConfig } from './config.js';
import { discordApi, type DiscordApi } from './discord/api.js';
import { isValidSignature, publicKeyFromHex } from './discord/signature.js';
import {
  authorOf,
  EPHEMERAL,
  Interaction,
  InteractionType,
  option,
  ResponseType,
} from './discord/types.js';
import { TRAY_PREFIX } from './tray.js';
import { ynerClient, type YnerClient } from './yner.js';

const BODY_LIMIT = 64 * 1024;

/** Commandes dont la réponse est lue par tout le salon. */
const PUBLIC_COMMANDS = new Set(['roll', 'history']);

/** Réponse publique ? Un jet caché répond à son auteur seul (le salon en est averti à part). */
function isPublicResponse(i: Interaction): boolean {
  return PUBLIC_COMMANDS.has(i.data?.name ?? '') && option(i, 'hidden') !== true;
}

export async function buildDiscord(
  config: DiscordConfig,
  extra: Omit<ServiceOptions, 'config'> & { yner?: YnerClient; discord?: DiscordApi } = {},
) {
  const { yner: providedYner, discord: providedDiscord, ...options } = extra;
  const app = await createService({ config, auth: false, ...options });

  const publicKey = config.DISCORD_PUBLIC_KEY ? publicKeyFromHex(config.DISCORD_PUBLIC_KEY) : null;
  if (!publicKey || !config.DISCORD_APPLICATION_ID)
    app.log.warn(
      'DISCORD_APPLICATION_ID ou DISCORD_PUBLIC_KEY absent : interactions désactivées (503)',
    );
  const bot = createBot({
    yner:
      providedYner ??
      ynerClient({
        identity: config.IDENTITY_URL,
        campaign: config.CAMPAIGN_URL,
        dice: config.DICE_URL,
        character: config.CHARACTER_URL,
        internalSecret: config.INTERNAL_API_SECRET,
      }),
    discord: providedDiscord ?? discordApi({ applicationId: config.DISCORD_APPLICATION_ID ?? '' }),
    appUrl: config.APP_URL,
    log: app.log,
  });

  /** Travail après la réponse : ses erreurs sont journalisées, jamais renvoyées à Discord. */
  const later = (req: FastifyRequest, work: () => Promise<void>) => {
    setImmediate(() => {
      work().catch((err: unknown) => req.log.error({ err }, 'interaction discord en échec'));
    });
  };

  // Contexte isolé : le corps reste brut (Buffer), la signature porte sur ces octets
  await app.register(async (scoped) => {
    scoped.removeAllContentTypeParsers();
    scoped.addContentTypeParser(
      '*',
      { parseAs: 'buffer', bodyLimit: BODY_LIMIT },
      (_req: FastifyRequest, body: Buffer, done: (err: Error | null, body?: Buffer) => void) =>
        done(null, body),
    );

    scoped.post(
      '/v1/discord/interactions',
      {
        config: { rateLimit: { max: 1200, timeWindow: '1 minute' } } as FastifyContextConfig,
        schema: { hide: true },
      },
      async (req, reply) => {
        if (!publicKey || !config.DISCORD_APPLICATION_ID)
          throw new HttpError(503, 'Service indisponible', 'discord_unconfigured');
        const raw = req.body;
        const signature = req.headers['x-signature-ed25519'];
        const timestamp = req.headers['x-signature-timestamp'];
        if (
          !Buffer.isBuffer(raw) ||
          !isValidSignature(
            publicKey,
            typeof signature === 'string' ? signature : undefined,
            typeof timestamp === 'string' ? timestamp : undefined,
            raw,
          )
        )
          throw HttpError.unauthorized('Signature Discord invalide');

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw.toString('utf8'));
        } catch {
          throw HttpError.badRequest('Corps illisible', 'invalid_body');
        }
        const result = Interaction.safeParse(parsed);
        if (!result.success) throw HttpError.badRequest('Interaction illisible', 'invalid_body');
        const i = result.data;
        if (i.type === InteractionType.Ping) return { type: ResponseType.Pong };

        const author = authorOf(i);
        if (!author) throw HttpError.badRequest('Auteur absent', 'invalid_body');

        switch (i.type) {
          case InteractionType.ApplicationCommand:
            later(req, () => bot.command(i, author));
            // Jets et historique : publics, sous la commande lancée ; le reste : pour l'auteur
            return reply.send({
              type: ResponseType.DeferredChannelMessage,
              data: isPublicResponse(i) ? {} : { flags: EPHEMERAL },
            });

          case InteractionType.Autocomplete: {
            const choices = await bot.autocomplete(i, author).catch((err: unknown) => {
              req.log.warn({ err }, 'autocomplétion discord en échec');
              return [];
            });
            return { type: ResponseType.AutocompleteResult, data: { choices } };
          }

          case InteractionType.MessageComponent: {
            if (!i.data?.custom_id?.startsWith(`${TRAY_PREFIX}:`))
              return { type: ResponseType.DeferredUpdateMessage };
            const message = (parsed as { message?: { content?: string } }).message;
            const response = await bot.trayClick({ ...i, ...(message ? { message } : {}) });
            if (response.type === ResponseType.DeferredUpdateMessage)
              later(req, () => bot.trayRoll(i, author));
            return response;
          }

          default:
            throw HttpError.badRequest(
              'Interaction non prise en charge',
              'unsupported_interaction',
            );
        }
      },
    );
  });

  return app;
}
