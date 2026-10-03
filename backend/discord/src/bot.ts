/**
 * Logique des commandes du bot de dés (docs/discord.md) : ce que chaque interaction produit.
 * Les réponses sont d'abord différées (limite de 3 s de Discord), puis complétées ici ; un
 * résultat public part en message de suite et la réponse éphémère d'attente est supprimée.
 */
import type { FastifyBaseLogger } from 'fastify';
import {
  describe,
  diceSetOf,
  isEmpty,
  rollRequestOf,
  suggestions,
  type DiceSet,
  type Selection,
} from './dice-set.js';
import type { DiscordApi } from './discord/api.js';
import {
  ButtonStyle,
  EPHEMERAL,
  option,
  type Embed,
  type Interaction,
  type Message,
} from './discord/types.js';
import { apply, decodeTray, trayMessage } from './tray.js';
import { YnerError, type Campaign, type Roll, type YnerClient } from './yner.js';

export interface BotDeps {
  yner: YnerClient;
  discord: DiscordApi;
  appUrl: string;
  log: FastifyBaseLogger;
}

const ROLE_LABEL: Record<string, string> = { gm: 'MJ', player: 'Joueur', spectator: 'Spectateur' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ephemeral = (content: string, extra: Partial<Message> = {}): Message => ({
  content,
  flags: EPHEMERAL,
  ...extra,
});

/** Réponse attendue par la route : renvoyée tout de suite à Discord. */
export type Immediate = { type: number; data?: unknown };

export function bot(deps: BotDeps) {
  const { yner, discord, appUrl, log } = deps;

  const linkButton = (): Message =>
    ephemeral('Compte Discord non lié à Yner.', {
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: ButtonStyle.Link,
              label: 'Lier mon compte',
              url: `${appUrl}/v1/auth/oauth/discord/start?redirect=/`,
            },
          ],
        },
      ],
    });

  const noActive = () => ephemeral('Aucune salle active : `/room` pour en choisir une.');

  async function diceSetFor(campaign: Campaign): Promise<DiceSet | null> {
    const system = await yner.gameSystem(campaign.system.id);
    return system ? diceSetOf(campaign.system.id, system) : null;
  }

  function resultEmbed(set: DiceSet | null, campaign: Campaign, roll: Roll): Embed {
    const symbols = roll.symbolResult;
    const critical = roll.outcome?.critical
      ? ' · Critique'
      : roll.outcome?.fumble
        ? ' · Échec critique'
        : '';
    return {
      title: `${roll.userName}${critical}`,
      description: symbols
        ? `**${symbols}**\n${roll.notation ?? ''}`.trim()
        : `**${roll.total ?? '—'}**\n\`${roll.output}\``,
      ...(set?.color !== undefined ? { color: set.color } : {}),
      footer: {
        text: [campaign.name, roll.visibility === 'public' ? null : 'Caché']
          .filter(Boolean)
          .join(' · '),
      },
    };
  }

  /** Publie un résultat : message public de suite, ou éphémère pour un jet caché. */
  async function publish(token: string, message: Message, isPublic: boolean) {
    if (isPublic) {
      await discord.followUp(token, message);
      await discord.deleteOriginal(token);
    } else {
      await discord.editOriginal(token, { ...message, flags: EPHEMERAL });
    }
  }

  /** Erreur d'un service : message éphémère lisible, jamais de trace. */
  function failureMessage(err: unknown): Message {
    if (err instanceof YnerError) {
      if (err.status === 429) return ephemeral('Trop de jets : patiente un instant.');
      if (err.status === 400 && err.detail) return ephemeral(err.detail);
      if (err.status === 403 || err.status === 404) return ephemeral('Accès refusé à cette salle.');
    }
    return ephemeral('Le service est indisponible, réessaie dans un instant.');
  }

  // ─── Commandes ────────────────────────────────────────────────────────────

  async function room(i: Interaction, token: string): Promise<Message> {
    const choice = option(i, 'campaign');
    if (typeof choice !== 'string' || !choice.trim()) {
      const active = await yner.activeCampaign(token);
      if (!active) return noActive();
      return ephemeral(
        `Salle active : **${active.name}** · ${ROLE_LABEL[active.role] ?? active.role}`,
      );
    }
    let campaignId = choice.trim();
    if (!UUID.test(campaignId)) {
      // Texte tapé sans choisir une suggestion : recherche par nom parmi ses campagnes
      const wanted = campaignId.toLowerCase();
      const found = (await yner.myCampaigns(token)).find((c) =>
        c.name.toLowerCase().includes(wanted),
      );
      if (!found) return ephemeral('Aucune de tes campagnes ne porte ce nom.');
      campaignId = found.id;
    }
    const active = await yner.setActiveCampaign(token, campaignId);
    if (!active) return ephemeral('Aucune de tes campagnes ne correspond.');
    return ephemeral(
      `Salle active : **${active.name}** · ${ROLE_LABEL[active.role] ?? active.role}`,
    );
  }

  async function roll(i: Interaction, token: string): Promise<void> {
    const active = await yner.activeCampaign(token);
    if (!active) return discord.editOriginal(i.token, noActive());
    const set = await diceSetFor(active);
    const typed = option(i, 'dice');
    if (typeof typed !== 'string' || !typed.trim()) {
      if (!set) return discord.editOriginal(i.token, ephemeral('Système de jeu inconnu.'));
      return discord.editOriginal(i.token, trayMessage(set, active.name));
    }
    const hidden = option(i, 'hidden') === true;
    const result = await yner.roll(token, {
      campaignId: active.id,
      systemId: active.system.id,
      characterId: active.playedCharacterId,
      notation: typed.trim(),
      hidden,
    });
    await publish(i.token, { embeds: [resultEmbed(set, active, result)] }, !hidden);
  }

  async function history(i: Interaction, token: string): Promise<void> {
    const active = await yner.activeCampaign(token);
    if (!active) return discord.editOriginal(i.token, noActive());
    const n = typeof option(i, 'count') === 'number' ? (option(i, 'count') as number) : 10;
    const player = option(i, 'player');
    const filter = typeof player === 'string' ? player.trim().toLowerCase() : '';
    // Seulement les jets publics : la réponse est lue par tout le salon
    const rolls = (await yner.rolls(token, active.id, 50))
      .filter((r) => r.visibility === 'public')
      .filter((r) => !filter || r.userName.toLowerCase().includes(filter))
      .slice(0, n);
    if (!rolls.length) return discord.editOriginal(i.token, ephemeral('Aucun jet public.'));
    const lines = rolls.map((r) => {
      const value = r.symbolResult ?? (r.total === null ? r.output : `**${r.total}**`);
      return `**${r.userName}** · ${value}${r.notation ? ` · \`${r.notation}\`` : ''}`;
    });
    await publish(
      i.token,
      { embeds: [{ title: active.name, description: lines.join('\n').slice(0, 4000) }] },
      true,
    );
  }

  async function stats(i: Interaction, token: string): Promise<Message> {
    const active = await yner.activeCampaign(token);
    if (!active) return noActive();
    const player = option(i, 'player');
    const filter = typeof player === 'string' ? player.trim().toLowerCase() : '';
    const s = await yner.stats(token, active.id);
    const players = s.players.filter((p) => !filter || p.userName.toLowerCase().includes(filter));
    if (!players.length) return ephemeral('Aucun jet.');
    return ephemeral('', {
      embeds: [
        {
          title: active.name,
          fields: players.slice(0, 25).map((p) => ({
            name: p.userName,
            value: [
              `${p.totalRolls} jets · moyenne ${p.averageRoll.toFixed(1)}`,
              p.highestRoll !== null ? `${p.lowestRoll} → ${p.highestRoll}` : null,
              p.criticalSuccesses || p.criticalFailures
                ? `${p.criticalSuccesses} critiques · ${p.criticalFailures} échecs critiques`
                : null,
            ]
              .filter(Boolean)
              .join('\n'),
            inline: true,
          })),
        },
      ],
    });
  }

  async function unlink(token: string): Promise<Message> {
    const result = await yner.unlink(token);
    if (result === 'unlinked') return ephemeral('Compte délié.');
    if (result === 'last_login_method')
      return ephemeral(
        'Discord est ton seul moyen de connexion : ajoute un mot de passe sur Yner avant de délier.',
      );
    return ephemeral('Compte déjà délié.');
  }

  /** Traite une commande après la réponse différée (éphémère). */
  async function command(i: Interaction, discordUserId: string): Promise<void> {
    const name = i.data?.name;
    try {
      const token = await yner.delegate(discordUserId);
      if (name === 'link')
        return await discord.editOriginal(
          i.token,
          token ? ephemeral('Compte déjà lié.') : linkButton(),
        );
      if (!token) return await discord.editOriginal(i.token, linkButton());
      switch (name) {
        case 'room':
          return await discord.editOriginal(i.token, await room(i, token));
        case 'roll':
          return await roll(i, token);
        case 'history':
          return await history(i, token);
        case 'stats':
          return await discord.editOriginal(i.token, await stats(i, token));
        case 'unlink':
          return await discord.editOriginal(i.token, await unlink(token));
        default:
          return await discord.editOriginal(i.token, ephemeral('Commande inconnue.'));
      }
    } catch (err) {
      log.warn({ err, command: name }, 'commande discord en échec');
      await discord.editOriginal(i.token, failureMessage(err)).catch(() => undefined);
    }
  }

  // ─── Autocomplétion ───────────────────────────────────────────────────────

  async function autocomplete(
    i: Interaction,
    discordUserId: string,
  ): Promise<{ name: string; value: string }[]> {
    const focused = i.data?.options?.find((o) => o.focused);
    const typed = typeof focused?.value === 'string' ? focused.value : '';
    const token = await yner.delegate(discordUserId);
    if (!token) return [];
    if (i.data?.name === 'room') {
      const wanted = typed.toLowerCase();
      const campaigns = await yner.myCampaigns(token);
      const systems = new Map<string, string>();
      for (const id of new Set(campaigns.map((c) => c.system.id))) {
        systems.set(id, (await yner.gameSystem(id))?.systeme.nom ?? id);
      }
      return campaigns
        .filter((c) => !wanted || c.name.toLowerCase().includes(wanted))
        .slice(0, 25)
        .map((c) => ({
          name: `${c.name} · ${systems.get(c.system.id)} · ${ROLE_LABEL[c.role] ?? c.role}`.slice(
            0,
            100,
          ),
          value: c.id,
        }));
    }
    if (i.data?.name === 'roll') {
      const active = await yner.activeCampaign(token);
      const set = active ? await diceSetFor(active) : null;
      return set ? suggestions(set, typed).map((s) => ({ name: s, value: s })) : [];
    }
    return [];
  }

  // ─── Plateau de dés ───────────────────────────────────────────────────────

  /** Clic sur un bouton du plateau : réponse immédiate (mise à jour) ou différée (lancer). */
  async function trayClick(
    i: Interaction & { message?: { content?: string } },
  ): Promise<Immediate> {
    const state = decodeTray(i.data?.custom_id ?? '');
    if (!state) return { type: 6 };
    const system = await yner.gameSystem(state.systemId);
    if (!system) return { type: 6 };
    const set = diceSetOf(state.systemId, system);
    const campaignName = /^\*\*(.+?)\*\* ·/.exec(i.message?.content ?? '')?.[1] ?? set.systemName;
    if (state.action.kind !== 'roll') {
      return { type: 7, data: trayMessage(set, campaignName, apply(set, state)) };
    }
    return { type: 6 };
  }

  /** Lancer depuis le plateau, après la réponse différée. */
  async function trayRoll(i: Interaction, discordUserId: string): Promise<void> {
    const state = decodeTray(i.data?.custom_id ?? '');
    if (!state || state.action.kind !== 'roll') return;
    try {
      const token = await yner.delegate(discordUserId);
      if (!token) return await discord.followUp(i.token, linkButton());
      const active = await yner.activeCampaign(token);
      if (!active) return await discord.followUp(i.token, noActive());
      const set = await diceSetFor(active);
      if (!set) return await discord.followUp(i.token, ephemeral('Système de jeu inconnu.'));
      if (set.systemId !== state.systemId) {
        // Salle active changée depuis l'ouverture du plateau : plateau du nouveau système
        return await discord.editOriginal(i.token, trayMessage(set, active.name));
      }
      const selection: Selection = apply(set, { ...state, action: { kind: 'clear' } });
      const chosen: Selection = {
        counts: set.dice.map((_, k) => state.selection.counts[k] ?? 0),
        modifier: state.selection.modifier,
      };
      if (isEmpty(chosen)) return;
      const result = await yner.roll(token, {
        campaignId: active.id,
        systemId: active.system.id,
        characterId: active.playedCharacterId,
        ...rollRequestOf(set, chosen),
        hidden: false,
      });
      const embed = resultEmbed(set, active, result);
      if (!result.notation)
        embed.description = `${embed.description}\n${describe(set, chosen)}`.trim();
      await discord.followUp(i.token, { embeds: [embed] });
      await discord.editOriginal(i.token, trayMessage(set, active.name, selection));
    } catch (err) {
      log.warn({ err }, 'lancer du plateau en échec');
      await discord.followUp(i.token, failureMessage(err)).catch(() => undefined);
    }
  }

  return { command, autocomplete, trayClick, trayRoll };
}

export type Bot = ReturnType<typeof bot>;
