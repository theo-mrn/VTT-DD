/**
 * Ce que le bot lit et écrit de l'API des interactions Discord (v10), sans plus.
 */
import { z } from 'zod';

export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  Autocomplete: 4,
} as const;

export const ResponseType = {
  Pong: 1,
  ChannelMessage: 4,
  DeferredChannelMessage: 5,
  DeferredUpdateMessage: 6,
  UpdateMessage: 7,
  AutocompleteResult: 8,
} as const;

/** Message visible du seul auteur de l'interaction. */
export const EPHEMERAL = 1 << 6;

export const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 } as const;

const DiscordUser = z.object({
  id: z.string().regex(/^\d{1,32}$/),
  username: z.string().optional(),
  global_name: z.string().nullish(),
});

const CommandOption = z.object({
  name: z.string(),
  type: z.number(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  focused: z.boolean().optional(),
});

export const Interaction = z.object({
  id: z.string(),
  application_id: z.string(),
  type: z.number(),
  token: z.string(),
  /** Salon d'un serveur : l'auteur est dans member ; message privé : dans user. */
  member: z.object({ user: DiscordUser }).optional(),
  user: DiscordUser.optional(),
  data: z
    .object({
      name: z.string().optional(),
      options: z.array(CommandOption).optional(),
      custom_id: z.string().optional(),
    })
    .optional(),
});
export type Interaction = z.infer<typeof Interaction>;

export interface Button {
  type: 2;
  style: number;
  label: string;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
}

export interface ActionRow {
  type: 1;
  components: Button[];
}

export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  footer?: { text: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

/** Contenu d'un message du bot (réponse, suite ou modification). */
export interface Message {
  content?: string;
  embeds?: Embed[];
  components?: ActionRow[];
  flags?: number;
  /** Aucune mention ne notifie : les noms viennent des joueurs. */
  allowed_mentions?: { parse: [] };
}

/** Auteur de l'interaction (serveur ou message privé). */
export function authorOf(i: Interaction): string | undefined {
  return i.member?.user.id ?? i.user?.id;
}

/** Nom affiché de l'auteur (nom global, sinon nom d'utilisateur). */
export function authorNameOf(i: Interaction): string | null {
  const u = i.member?.user ?? i.user;
  return u?.global_name || u?.username || null;
}

/** Valeur d'une option de commande. */
export function option(i: Interaction, name: string): string | number | boolean | undefined {
  return i.data?.options?.find((o) => o.name === name)?.value;
}
