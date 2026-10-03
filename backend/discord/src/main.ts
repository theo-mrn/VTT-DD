import { loadConfig, start } from '@vtt/platform';
import { buildDiscord } from './app.js';
import { DiscordConfig } from './config.js';

const config = loadConfig(DiscordConfig);
const app = await buildDiscord(config);
await start(app, config);
