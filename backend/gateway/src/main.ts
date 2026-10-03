import { loadConfig, start } from '@vtt/platform';
import { buildGateway, GatewayConfig } from './app.js';

const config = loadConfig(GatewayConfig);
const app = await buildGateway(config);
await start(app, config);
