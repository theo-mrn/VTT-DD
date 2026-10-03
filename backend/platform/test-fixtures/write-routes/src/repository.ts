import { appendEvent as emit } from './outbox.js';

/** Chaîne d'appels : helper importé sous un alias, puis émetteur. */
export async function save(name: string) {
  await persist(name);
}

async function persist(name: string) {
  await emit(`thing.saved:${name}`);
}

/** Fabrique : un membre émet, l'autre non. */
export function makeRepo() {
  return {
    remove: async (id: string) => emit(`thing.removed:${id}`),
    touch: async (id: string) => id.length,
  };
}

/** Constante calculée qui référence l'émetteur : ne doit pas contaminer ses voisins. */
export const helpers = { emitting: save, quiet: (x: string) => x.trim() };
