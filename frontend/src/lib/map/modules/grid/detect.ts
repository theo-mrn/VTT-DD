/**
 * Détection du quadrillage dessiné dans un fond (docs/carte.md § 4) : la plupart des cartes de
 * bataille portent leurs cases. Sur une copie réduite de l'image en niveaux de gris :
 *
 * 1. profils des contours : pour chaque colonne, la somme des écarts horizontaux entre pixels
 *    voisins (les lignes verticales du quadrillage y font des pics réguliers) ; pour chaque
 *    ligne, celle des écarts verticaux ; passe-haut puis centrés réduits (pics en écarts-types) ;
 * 2. peigne : pour chaque pas et chaque origine, la moyenne du profil sur les dents, en
 *    significativité (moyenne × √dents, moins le maximum attendu du bruit sur toutes les
 *    origines essayées). Un quadrillage a la même moyenne à son pas et à ses multiples, mais son
 *    pas a plus de dents : il l'emporte ; son demi-pas tombe à moitié entre les lignes. Un grand
 *    pas (peu de dents) ne gagne plus sur une coïncidence. Contrairement à l'autocorrélation, la
 *    texture de l'image ne favorise pas les grands pas ;
 * 3. cases carrées : le score d'un pas est le plus faible des deux axes ; le plus petit pas
 *    dont ce score approche le meilleur l'emporte (un axe peut préférer de peu un multiple) ;
 *    un pas multiple des blocs de compression (8, 16 px) dominé par eux est écarté. Sinon, pas
 *    de quadrillage sûr : le MJ calibre.
 *
 * Fonction pure sur des pixels (testée) ; `detectGrid` lit l'image dans le navigateur.
 */

export interface DetectedGrid {
  /** Côté d'une case, en pixels de l'image d'origine. */
  size: number;
  offsetX: number;
  offsetY: number;
  /** Score du peigne le plus faible des deux axes (écarts-types au-dessus de la moyenne). */
  confidence: number;
}

/** Largeur de l'analyse : assez pour garder des traits fins, assez peu pour rester rapide. */
export const DETECT_WIDTH = 2048;
/**
 * Significativité minimale du peigne (le plus faible des deux axes) pour croire à un
 * quadrillage. Mesuré sur la bibliothèque : 12 à 22 pour les cartes quadrillées, 9 au plus
 * pour les autres (texture, blocs de compression).
 */
export const MIN_CONFIDENCE = 10;
/** Case minimale en pixels de l'image d'origine (plus petit : bruit, blocs de compression). */
export const MIN_CELL = 24;
/** Au moins ce nombre de dents : un pas plus grand est trop peu attesté. */
const MIN_TEETH = 6;
/** Blocs de compression (JPEG 8 px, WebP et vidéo 16 px), en pixels de l'image d'origine. */
const CODEC_BLOCK = 16;

/** Profil passe-haut, centré réduit : les lignes du quadrillage en écarts-types. */
function normalize(s: Float64Array): Float64Array {
  const n = s.length;
  const radius = 6;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + s[i]!;
  const d = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    d[i] = s[i]! - (prefix[b]! - prefix[a]!) / (b - a);
    sum += d[i]!;
  }
  const mean = sum / n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (d[i]! - mean) ** 2;
  const sd = Math.sqrt(v / n) || 1;
  for (let i = 0; i < n; i++) d[i] = (d[i]! - mean) / sd;
  return d;
}

/**
 * Peigne de pas `p` : la meilleure origine, sa moyenne sur les dents (en écarts-types) et sa
 * significativité (moyenne × √dents, moins le maximum attendu du bruit sur les origines).
 */
function comb(z: Float64Array, p: number): { score: number; mean: number; phase: number } {
  const n = z.length;
  let best = { mean: -Infinity, phase: 0, count: 0 };
  for (let phase = 0; phase < p; phase += 0.5) {
    let sum = 0;
    let count = 0;
    for (let x = phase; x < n - 1; x += p) {
      const i = Math.floor(x);
      const t = x - i;
      // Trait de 1 à 2 px : le plus fort des deux voisins
      sum += Math.max(z[i]!, z[i + 1]! * t + z[i]! * (1 - t));
      count++;
    }
    const mean = count >= 3 ? sum / count : -Infinity;
    if (mean > best.mean) best = { mean, phase, count };
  }
  const noise = Math.sqrt(2 * Math.log(Math.max(2, p * 2)));
  return {
    score: best.mean * Math.sqrt(best.count) - noise,
    mean: best.mean,
    phase: best.phase,
  };
}

/** Pas « équivalent » au meilleur : score commun au moins à cette part du meilleur. */
const NEAR_BEST = 0.85;

/**
 * Pas commun aux deux axes (cases carrées), en pixels d'analyse : pour chaque pas, le plus
 * faible des deux scores ; le plus petit pas dont ce score approche le meilleur (un multiple
 * du pas peut l'emporter de peu sur un axe). Null sans peigne net sur les deux axes.
 */
function commonPeriod(
  cols: Float64Array,
  rows: Float64Array,
  min: number,
  block: number,
): { p: number; score: number; ox: number; oy: number } | null {
  const zx = normalize(cols);
  const zy = normalize(rows);
  const max = Math.min(zx.length, zy.length) / MIN_TEETH;
  if (max <= min) return null;
  const joint = (p: number) => {
    const x = comb(zx, p);
    const y = comb(zy, p);
    return { p, score: Math.min(x.score, y.score), mean: Math.min(x.mean, y.mean), x, y };
  };
  const all: ReturnType<typeof joint>[] = [];
  for (let p = min; p <= max; p += 0.25) all.push(joint(p));
  const best = all.reduce((a, b) => (b.score > a.score ? b : a), all[0]!);
  if (best.score < MIN_CONFIDENCE) return null;
  let chosen = all.find((c) => c.score >= NEAR_BEST * best.score)!;
  // Affinage autour du pas retenu
  const coarse = chosen.p;
  for (let p = coarse - 0.25; p <= coarse + 0.25; p += 0.05) {
    const c = joint(p);
    if (c.score > chosen.score) chosen = c;
  }
  // Collé à la borne : le vrai pas est peut-être plus petit (ou n'est que du bruit)
  if (chosen.p < min + 0.5) return null;
  // Blocs de compression : un pas multiple de leur taille, que leur propre peigne égale
  if (block >= 2 && Math.abs(chosen.p / block - Math.round(chosen.p / block)) < 0.04) {
    if (joint(block).mean >= 0.7 * chosen.mean) return null;
  }
  return { p: chosen.p, score: chosen.score, ox: chosen.x.phase, oy: chosen.y.phase };
}

/**
 * Quadrillage d'une image en niveaux de gris (`gray[y * w + x]`, 0 à 255), aux coordonnées de
 * cette image ; null si aucun n'est sûr.
 */
export function detectGridInPixels(
  gray: Float32Array,
  w: number,
  h: number,
  /** Pixels de l'image d'origine par pixel analysé (image réduite). */
  scale = 1,
): DetectedGrid | null {
  if (w < 64 || h < 64) return null;
  const cols = new Float64Array(w);
  const rows = new Float64Array(h);
  for (let y = 0; y < h - 1; y++) {
    const row = y * w;
    for (let x = 0; x < w - 1; x++) {
      const v = gray[row + x]!;
      cols[x]! += Math.abs(gray[row + x + 1]! - v);
      rows[y]! += Math.abs(gray[row + w + x]! - v);
    }
  }
  const min = Math.max(6, MIN_CELL / scale);
  const found = commonPeriod(cols, rows, min, CODEC_BLOCK / scale);
  if (!found) return null;
  return { size: found.p, offsetX: found.ox, offsetY: found.oy, confidence: found.score };
}

/**
 * Quadrillage dessiné dans un fond (image ou vidéo : sa première seconde), en pixels du monde
 * (`worldWidth` : largeur du monde, quand l'image lue est une variante réduite du fond) ; null
 * si aucun n'est sûr ou si l'image ne peut pas être lue (CORS).
 */
export async function detectGrid(
  url: string,
  video: boolean,
  worldWidth?: number,
): Promise<DetectedGrid | null> {
  try {
    const source = video ? await videoFrame(url) : await imageBitmap(url);
    if (!source) return null;
    // Lu avant la libération de l'image (sa largeur retombe à 0 ensuite)
    const sourceWidth = source.width;
    const naturalWidth = worldWidth && worldWidth > 0 ? worldWidth : sourceWidth;
    const scale = Math.min(1, DETECT_WIDTH / sourceWidth);
    const w = Math.max(1, Math.round(sourceWidth * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);
    if ('close' in source) source.close();
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4)
      gray[i] = 0.299 * data[j]! + 0.587 * data[j + 1]! + 0.114 * data[j + 2]!;
    // Analyse à l'échelle de l'image lue (blocs de compression, case minimale), résultat
    // rapporté au monde
    const found = detectGridInPixels(gray, w, h, sourceWidth / w);
    if (!found) return null;
    const k = naturalWidth / w;
    return {
      size: found.size * k,
      offsetX: found.offsetX * k,
      offsetY: found.offsetY * k,
      confidence: found.confidence,
    };
  } catch {
    return null;
  }
}

async function imageBitmap(url: string): Promise<ImageBitmap | null> {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
  if (!res.ok) return null;
  return createImageBitmap(await res.blob());
}

/** Image d'une vidéo à 1 s (ou à sa fin si plus courte), lisible par le canvas. */
function videoFrame(url: string): Promise<ImageBitmap | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.preload = 'auto';
    const done = (r: ImageBitmap | null) => {
      v.removeAttribute('src');
      v.load();
      resolve(r);
    };
    v.addEventListener('loadedmetadata', () => {
      v.currentTime = Math.min(1, (v.duration || 1) / 2);
    });
    v.addEventListener('seeked', () => {
      createImageBitmap(v).then(done, () => done(null));
    });
    v.addEventListener('error', () => done(null));
    v.src = url;
  });
}
