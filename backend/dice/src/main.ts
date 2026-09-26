import { loadConfig, start } from '@vtt/platform';
import { buildDice } from './app.js';
import { DiceConfig } from './config.js';

const config = loadConfig(DiceConfig);
const app = await buildDice(config);
await start(app, config);
