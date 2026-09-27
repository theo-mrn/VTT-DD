import { loadConfig, start } from '@vtt/platform';
import { buildHistory } from './app.js';
import { HistoryConfig } from './config.js';

const config = loadConfig(HistoryConfig);
const app = await buildHistory(config);
await start(app, config);
