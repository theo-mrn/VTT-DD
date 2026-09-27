import { loadConfig, start } from '@vtt/platform';
import { buildBilling } from './app.js';
import { BillingConfig } from './config.js';

const config = loadConfig(BillingConfig);
const app = await buildBilling(config);
await start(app, config);
