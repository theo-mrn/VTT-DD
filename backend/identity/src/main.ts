import { loadConfig, start } from '@vtt/platform';
import { buildIdentity } from './app.js';
import { IdentityConfig } from './config.js';

const config = loadConfig(IdentityConfig);
const app = await buildIdentity(config);
await start(app, config);
