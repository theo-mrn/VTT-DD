// Module loader — registers all built-in modules
import { moduleRegistry } from './registry';
import { moduleManagerModule } from './builtin/module-manager';

moduleRegistry.register(moduleManagerModule);
