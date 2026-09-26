import { loadConfig, start } from '@vtt/platform';
import { buildCampaign } from './app.js';
import { CampaignConfig } from './config.js';

const config = loadConfig(CampaignConfig);
const app = await buildCampaign(config);
await start(app, config);
