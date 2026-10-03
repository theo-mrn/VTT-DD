/**
 * Polices des textes de la carte (docs/carte.md § 10, Dessins et textes), auto-hébergées par
 * `next/font` (aucun appel à Google au moment de jouer). `preload: false` : aucune n'est
 * téléchargée tant qu'un texte ne l'utilise pas. Chacune pose sa variable CSS sur <html>
 * (`--font-map-<id>`) ; le catalogue (libellés, groupes) est dans
 * `lib/map/modules/drawings/palette.ts`, sans dépendre de ce fichier (testable sans Next).
 *
 * `next/font` exige des options écrites en toutes lettres : une déclaration par police.
 */
import {
  Almendra,
  Audiowide,
  Bebas_Neue,
  Caveat,
  Cinzel_Decorative,
  Creepster,
  Dancing_Script,
  IM_Fell_English,
  Indie_Flower,
  Kalam,
  Lora,
  MedievalSharp,
  Nosifer,
  Orbitron,
  Pirata_One,
  Shadows_Into_Light,
  Share_Tech_Mono,
  Special_Elite,
  Uncial_Antiqua,
  UnifrakturMaguntia,
} from 'next/font/google';

const lora = Lora({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-map-lora',
});
const imFell = IM_Fell_English({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-im-fell',
});
const medievalSharp = MedievalSharp({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-medieval-sharp',
});
const uncial = Uncial_Antiqua({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-uncial',
});
const almendra = Almendra({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-almendra',
});
const cinzelDecorative = Cinzel_Decorative({
  subsets: ['latin'],
  weight: '700',
  display: 'swap',
  preload: false,
  variable: '--font-map-cinzel-decorative',
});
const pirata = Pirata_One({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-pirata',
});
const unifraktur = UnifrakturMaguntia({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-unifraktur',
});
const caveat = Caveat({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-map-caveat',
});
const kalam = Kalam({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-kalam',
});
const dancing = Dancing_Script({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-map-dancing',
});
const indieFlower = Indie_Flower({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-indie-flower',
});
const shadows = Shadows_Into_Light({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-shadows',
});
const bebas = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-bebas',
});
const orbitron = Orbitron({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-map-orbitron',
});
const audiowide = Audiowide({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-audiowide',
});
const shareTech = Share_Tech_Mono({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-share-tech',
});
const specialElite = Special_Elite({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-special-elite',
});
const creepster = Creepster({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: false,
  variable: '--font-map-creepster',
});
const nosifer = Nosifer({
  subsets: ['latin'],
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
