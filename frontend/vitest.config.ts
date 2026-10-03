import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests unitaires du front (moteur audio…) : environnement Node, faux AudioContext.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Même profil de machine partout (cœurs, OS) : voir src/test/machine.ts
    setupFiles: ['src/test/machine.ts'],
  },
});
