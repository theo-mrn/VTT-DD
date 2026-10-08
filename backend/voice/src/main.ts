import { loadConfig, start } from '@vtt/platform';
import { buildVoice } from './app.js';
import { VoiceConfig } from './config.js';

const config = loadConfig(VoiceConfig);
const app = await buildVoice(config);
await start(app, config);
