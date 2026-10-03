/**
 * Enregistre les commandes du bot auprès de Discord (remplace les commandes globales de
 * l'application, idempotent) : `pnpm --filter @vtt/discord commands:register`.
 */
import { COMMANDS } from './commands.js';
import { registerCommands } from './discord/api.js';

const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
if (!applicationId || !botToken) {
  console.error('DISCORD_APPLICATION_ID et DISCORD_BOT_TOKEN sont requis');
  process.exit(1);
}
await registerCommands({ applicationId, botToken, commands: COMMANDS });
console.log(
  `${COMMANDS.length} commandes enregistrées : ${COMMANDS.map((c) => `/${c.name}`).join(' ')}`,
);
