/**
 * Générateurs de nombres aléatoires injectables. Le moteur ne lit jamais
 * Math.random : un jet est reproductible à partir de sa graine, ce qui permet
 * de le rejouer ou de le vérifier côté serveur.
 */

/** Ce que le moteur sait d'un dé demandé, au-delà de son nombre de faces. */
export interface ContexteDe {
  /**
   * Sorte d'un dé à symboles (`aptitude`, `difficulte`…) : deux sortes peuvent avoir le même
   * nombre de faces, un dé physique doit les distinguer. Absente : dé numérique.
   */
  de?: string;
}

/**
 * Phase d'une action où des dés sont lancés : `jet` (variables et jet), `apres` (valeurs après
 * le jet, conséquences), `tables` (tirages), `fin` (l'action est finie). Les dés d'une phase ne
 * sont connus qu'une fois la précédente résolue (pas de dégâts sur un raté).
 */
export type PhaseDes = 'jet' | 'apres' | 'tables' | 'fin';

export interface Generateur {
  /** Entier uniforme entre 1 et `max` inclus. */
  entier(max: number, contexte?: ContexteDe): number;
  /**
   * Début d'une phase de l'action (appelé par le moteur des actions). Un générateur partagé
   * (jet commun) ou planifié (dés physiques) s'en sert pour repérer chaque dé par sa phase et
   * sa position ; les autres l'ignorent.
   */
  phase?(nom: PhaseDes): void;
}

/** Hachage 32 bits (cyrb53 réduit) pour dériver l'état initial d'une graine texte. */
function hacher(graine: string): [number, number, number, number] {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < graine.length; i++) {
    const c = graine.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0, (h1 ^ h2) >>> 0, (h1 + h2) >>> 0];
}

/** Générateur déterministe (sfc32) : même graine, même suite de résultats. */
export function aleatoireGraine(graine: string | number): Generateur {
  let [a, b, c, d] = hacher(String(graine));
  const suivant = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 15; i++) suivant();
  return { entier: (max) => tirerSansBiais(max, suivant) };
}

/** Générateur cryptographique, pour les jets qui font autorité côté serveur. */
export function aleatoireCrypto(): Generateur {
  const tampon = new Uint32Array(1);
  return {
    entier: (max) =>
      tirerSansBiais(max, () => {
        crypto.getRandomValues(tampon);
        return tampon[0]!;
      }),
  };
}

/** Générateur qui rejoue une liste de résultats imposés (tests, jets physiques saisis). */
export function aleatoireImpose(resultats: number[]): Generateur {
  let i = 0;
  return {
    entier: (max) => {
      const r = resultats[i++];
      if (r === undefined) throw new Error('Plus de résultats imposés');
      if (r < 1 || r > max) throw new Error(`Résultat imposé ${r} hors de 1..${max}`);
      return r;
    },
  };
}

/** Rejet des valeurs de la zone biaisée pour garder une distribution uniforme. */
function tirerSansBiais(max: number, u32: () => number): number {
  if (!Number.isInteger(max) || max < 1) throw new Error(`Nombre de faces invalide : ${max}`);
  const plafond = Math.floor(0x1_0000_0000 / max) * max;
  let x = u32();
  while (x >= plafond) x = u32();
  return (x % max) + 1;
}
