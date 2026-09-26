import { loadConfig, start } from '@vtt/platform';
import { buildCharacter } from './app.js';
import { CharacterConfig } from './config.js';

const config = loadConfig(CharacterConfig);
const app = await buildCharacter(config);
await start(app, config);
