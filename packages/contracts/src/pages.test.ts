import { describe, expect, it } from 'vitest';
import { PAGES_FRONT } from './pages.js';

describe('PAGES_FRONT', () => {
  it.each(Object.entries(PAGES_FRONT))(
    '%s est un chemin absolu, sans paramètres',
    (_nom, chemin) => {
      expect(chemin).toMatch(/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/);
    },
  );
});
