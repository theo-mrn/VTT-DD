import { loadConfig, start } from '@vtt/platform';
import { buildLibrary } from './app.js';
import { LibraryConfig } from './config.js';

const config = loadConfig(LibraryConfig);
const app = await buildLibrary(config);
await start(app, config);
