// Module loader — registers all built-in modules
import { moduleRegistry } from './registry';
import { moduleManagerModule } from './builtin/module-manager';
import { dndClassicModule } from './builtin/dnd-classic';

moduleRegistry.register(moduleManagerModule);
moduleRegistry.register(dndClassicModule);
