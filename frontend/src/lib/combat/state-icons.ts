/**
 * Icônes des états (docs/combat.md § 12.3, § 12.5, § 14) : la présentation du système choisit,
 * pour chaque état de son catalogue, une icône générique (`combat.etats.icones`, énumération
 * `IconeEtat` de `@vtt/rules`) ; le front la dessine. La correspondance est une donnée : un
 * dessin lucide par icône, jamais une clé de jeu. Un état sans icône déclarée (état libre,
 * système qui n'en déclare pas) prend l'icône générique `etat`.
 *
 * La carte dessine en PixiJS : `lucideSvg` donne le dessin d'une icône en SVG (traits blancs, à
 * teinter), lu dans le composant lucide lui-même.
 */
import type { IconeEtat, Presentation } from '@vtt/rules';
import {
  Angry,
  ArrowDownToLine,
  BatteryLow,
  Biohazard,
  BrickWall,
  CircleDot,
  Droplets,
  EarOff,
  Eye,
  EyeOff,
  Flame,
  Frown,
  Ghost,
  Heart,
  HeartCrack,
  Link,
  Lock,
  Moon,
  Music,
  Orbit,
  Shield,
  Shuffle,
  Skull,
  Snowflake,
  Sun,
  type LucideIcon,
} from 'lucide-react';

/** Dessin de chaque icône d'état que la présentation peut choisir. */
export const STATE_ICONS: Record<IconeEtat, LucideIcon> = {
  etat: CircleDot,
  aveugle: EyeOff,
  assourdi: EarOff,
  charme: Heart,
  peur: Frown,
  paralyse: Lock,
  etourdi: Orbit,
  inconscient: Moon,
  poison: Biohazard,
  saignement: Droplets,
  affaibli: BatteryLow,
  desoriente: Shuffle,
  'a-terre': ArrowDownToLine,
  entrave: Link,
  danse: Music,
  protection: Shield,
  couvert: BrickWall,
  blessure: HeartCrack,
  feu: Flame,
  froid: Snowflake,
  rage: Angry,
  invisible: Ghost,
  benediction: Sun,
  malediction: Skull,
  alerte: Eye,
};

const isStateIcon = (v: unknown): v is IconeEtat =>
  typeof v === 'string' && Object.hasOwn(STATE_ICONS, v);

/** Icônes déclarées par la présentation, par entrée du catalogue (vide sans `combat.etats`). */
export function stateIconsOf(
  presentation: Presentation | null | undefined,
): Readonly<Record<string, IconeEtat>> {
  const icons = presentation?.combat?.etats?.icones ?? {};
  const out: Record<string, IconeEtat> = {};
  for (const [entry, icon] of Object.entries(icons)) if (isStateIcon(icon)) out[entry] = icon;
  return out;
}

/** Icône d'un état : celle de son entrée, sinon l'icône générique (état libre, bonus). */
export function stateIconOf(
  icons: Readonly<Record<string, IconeEtat>>,
  entry: string | null | undefined,
): IconeEtat {
  return (entry && icons[entry]) || 'etat';
}

type IconNode = readonly (readonly [string, Record<string, string | number>])[];

/** Nœuds SVG d'une icône lucide (lus dans son rendu : lucide ne les exporte pas). */
function iconNodeOf(icon: LucideIcon): IconNode | null {
  const render = (icon as unknown as { render?: (props: object, ref: null) => unknown }).render;
  if (typeof render !== 'function') return null;
  const element = render({}, null) as { props?: { iconNode?: unknown } } | null;
  const node = element?.props?.iconNode;
  return Array.isArray(node) ? (node as IconNode) : null;
}

const escapeAttr = (v: string | number) =>
  String(v).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

/**
 * Dessin SVG (24 × 24, traits blancs de 2) d'une icône lucide, pour la carte : le moteur le
 * convertit en tracés (`Graphics.svg`) puis le teinte. Null si l'icône ne se lit pas.
 */
export function lucideSvg(icon: LucideIcon): string | null {
  const node = iconNodeOf(icon);
  if (!node) return null;
  const children = node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
    'fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    `${children}</svg>`
  );
}
