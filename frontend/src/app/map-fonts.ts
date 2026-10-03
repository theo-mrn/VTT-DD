/**
 * Polices des textes de la carte (docs/carte.md § 10, Dessins et textes), hébergées dans le dépôt
 * (src/app/fonts, sous-ensemble latin de Google Fonts) : ni le build ni la partie n'appellent
 * Google. `preload: false` : aucune n'est téléchargée tant qu'un texte ne l'utilise pas. Chacune
 * pose sa variable CSS sur <html> (`--font-map-<id>`) ; le catalogue (libellés, groupes) est dans
 * `lib/map/modules/drawings/palette.ts`, sans dépendre de ce fichier (testable sans Next).
 *
 * `next/font` exige des options écrites en toutes lettres : une déclaration par police.
 */
import localFont from 'next/font/local';

const lora = localFont({
  src: './fonts/lora.woff2',
  weight: '400 700',
  display: 'swap',
  preload: false,
  variable: '--font-map-lora',
});
const imFell = localFont({
  src: './fonts/im-fell-english.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-im-fell',
});
const medievalSharp = localFont({
  src: './fonts/medieval-sharp.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-medieval-sharp',
});
const uncial = localFont({
  src: './fonts/uncial-antiqua.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-uncial',
});
const almendra = localFont({
  src: './fonts/almendra.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-almendra',
});
const cinzelDecorative = localFont({
  src: './fonts/cinzel-decorative-700.woff2',
  weight: '700',
  display: 'swap',
  preload: false,
  variable: '--font-map-cinzel-decorative',
});
const pirata = localFont({
  src: './fonts/pirata-one.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-pirata',
});
const unifraktur = localFont({
  src: './fonts/unifraktur-maguntia.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-unifraktur',
});
const caveat = localFont({
  src: './fonts/caveat.woff2',
  weight: '400 700',
  display: 'swap',
  preload: false,
  variable: '--font-map-caveat',
});
const kalam = localFont({
  src: './fonts/kalam-400.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-kalam',
});
const dancing = localFont({
  src: './fonts/dancing-script.woff2',
  weight: '400 700',
  display: 'swap',
  preload: false,
  variable: '--font-map-dancing',
});
const indieFlower = localFont({
  src: './fonts/indie-flower.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-indie-flower',
});
const shadows = localFont({
  src: './fonts/shadows-into-light.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-shadows',
});
const bebas = localFont({
  src: './fonts/bebas-neue.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-bebas',
});
const orbitron = localFont({
  src: './fonts/orbitron.woff2',
  weight: '400 900',
  display: 'swap',
  preload: false,
  variable: '--font-map-orbitron',
});
const audiowide = localFont({
  src: './fonts/audiowide.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-audiowide',
});
const shareTech = localFont({
  src: './fonts/share-tech-mono.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-share-tech',
});
const specialElite = localFont({
  src: './fonts/special-elite.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-special-elite',
});
const creepster = localFont({
  src: './fonts/creepster.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-creepster',
});
const nosifer = localFont({
  src: './fonts/nosifer.woff2',
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-nosifer',
});

/** Classes à poser sur <html> : toutes les variables `--font-map-*`. */
export const MAP_FONT_VARIABLES = [
  lora,
  imFell,
  medievalSharp,
  uncial,
  almendra,
  cinzelDecorative,
  pirata,
  unifraktur,
  caveat,
  kalam,
  dancing,
  indieFlower,
  shadows,
  bebas,
  orbitron,
  audiowide,
  shareTech,
  specialElite,
  creepster,
  nosifer,
]
  .map((f) => f.variable)
  .join(' ');
