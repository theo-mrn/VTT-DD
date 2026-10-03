/**
 * Appels REST à Discord : messages d'une interaction (par son jeton, valable 15 minutes, sans
 * jeton de bot) et enregistrement des commandes (jeton du bot).
 */
import type { Message } from './types.js';

export const DISCORD_API = 'https://discord.com/api/v10';
const TIMEOUT_MS = 10_000;

export interface DiscordApi {
  /** Remplace la réponse différée de l'interaction. */
  editOriginal(token: string, message: Message): Promise<void>;
  /** Supprime la réponse de l'interaction. */
  deleteOriginal(token: string): Promise<void>;
  /** Message de suite (public ou éphémère selon ses drapeaux). */
  followUp(token: string, message: Message): Promise<void>;
}

export class DiscordError extends Error {
  constructor(
    public readonly status: number,
    step: string,
  ) {
    super(`discord : ${step} a répondu ${status}`);
    this.name = 'DiscordError';
  }
}

export function discordApi(o: { applicationId: string; fetch?: typeof fetch }): DiscordApi {
  const doFetch = o.fetch ?? fetch;
  const webhook = (token: string) =>
    `${DISCORD_API}/webhooks/${o.applicationId}/${encodeURIComponent(token)}`;

  async function call(step: string, url: string, method: string, body?: Message) {
    const res = await doFetch(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body }) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new DiscordError(res.status, step);
  }

  return {
    editOriginal: (token, message) =>
      call('modification', `${webhook(token)}/messages/@original`, 'PATCH', message),
    deleteOriginal: (token) =>
      call('suppression', `${webhook(token)}/messages/@original`, 'DELETE'),
    followUp: (token, message) => call('suite', webhook(token), 'POST', message),
  };
}

/** Enregistre (remplace) les commandes globales de l'application. */
export async function registerCommands(o: {
  applicationId: string;
  botToken: string;
  commands: unknown[];
  fetch?: typeof fetch;
}): Promise<void> {
  const res = await (o.fetch ?? fetch)(`${DISCORD_API}/applications/${o.applicationId}/commands`, {
    method: 'PUT',
    headers: { authorization: `Bot ${o.botToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(o.commands),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new DiscordError(res.status, 'enregistrement des commandes');
}
