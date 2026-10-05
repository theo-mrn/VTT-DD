import { defineConfig } from 'vitest/config';

// Les tests couvrent la règle de vente (skins gratuits et payants, achats publiés par billing),
// désactivée en production (backend/dice/src/skins/catalog.ts).
export default defineConfig({ test: { env: { SKINS_FOR_SALE: 'on' } } });
