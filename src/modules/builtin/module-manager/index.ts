import type { ModuleDefinition } from '@/modules/types';

export const moduleManagerModule: ModuleDefinition = {
  manifest: {
    id: 'module-manager',
    name: 'Gestionnaire de Modules',
    version: '1.0.0',
    description: 'Installez et gérez des modules externes pour étendre votre VTT.',
    author: 'VTT-DD Core',
    type: 'feature',
    defaultEnabled: true,
  },
};
