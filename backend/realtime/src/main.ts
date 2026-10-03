import { loadConfig, start } from '@vtt/platform';
import { buildRealtime } from './app.js';
import { RealtimeConfig } from './config.js';

const config = loadConfig(RealtimeConfig);
const app = await buildRealtime(config);
await start(app, config);
