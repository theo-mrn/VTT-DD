'use client';

/**
 * Icône d'un objet de l'inventaire : celle que la présentation du système déclare pour
 * sa sorte ou sa catégorie (`iconesObjets`), sinon déduite de la forme de sa sorte (jamais
 * de son identifiant) : une formule de jet (arme), équipable (armure, accessoire), en
 * quantité (consommables), sinon un objet. L'image de l'entrée la remplace.
 */
import {
  valeurChamp,
  type Entree,
  type IconeObjet,
  type Possession,
  type RegleIconeObjet,
  type Sorte,
} from '@vtt/rules';
import {
  Axe,
  Backpack,
  Bomb,
  Bone,
  BookOpen,
  Box,
  Compass,
  Cpu,
  Crosshair,
  Crown,
  Drumstick,
  Feather,
  Flame,
  FlaskConical,
  Gem,
  Hammer,
  KeyRound,
  Layers,
  Heart,
  Map as Carte,
  Package,
  Pill,
  ScrollText,
  Shield,
  Shirt,
  Sword,
  Swords,
  Syringe,
  WandSparkles,
  Wine,
  Wrench,
  Coins,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type FormeSorte = Pick<Sorte, 'champs' | 'activable' | 'quantites'>;

/** Dessin de chaque icône générique que la présentation peut choisir. */
export const ICONES: Record<IconeObjet, LucideIcon> = {
  epee: Sword,
  hache: Axe,
  marteau: Hammer,
  cible: Crosshair,
  bombe: Bomb,
  bouclier: Shield,
  vetement: Shirt,
  fiole: FlaskConical,
  pilule: Pill,
  seringue: Syringe,
  pieces: Coins,
  gemme: Gem,
  couronne: Crown,
  sac: Backpack,
  paquet: Package,
  livre: BookOpen,
  parchemin: ScrollText,
  carte: Carte,
  boussole: Compass,
  nourriture: Drumstick,
  boisson: Wine,
  outil: Wrench,
  cle: KeyRound,
  flamme: Flame,
  baguette: WandSparkles,
  electronique: Cpu,
  plume: Feather,
  os: Bone,
  objet: Box,
  coeur: Heart,
};

/**
 * Icône d'un objet : la première règle de la présentation qui lui convient (sa sorte, la
 * valeur d'un de ses champs, celle de l'exemplaire d'abord), sinon celle de sa sorte.
 */
export function iconeObjet(
  regles: readonly RegleIconeObjet[],
  objet: { entree: Entree; sorte: Sorte; possession?: Possession | undefined },
): LucideIcon {
  for (const r of regles) {
    if (r.sorte !== undefined && r.sorte !== objet.sorte.id) continue;
    if (r.champ !== undefined) {
      const c = objet.sorte.champs.find((x) => x.id === r.champ);
      if (!c || valeurChamp(objet.entree, c, objet.possession) !== r.valeur) continue;
    }
    return ICONES[r.icone];
  }
  return iconeSorte(objet.sorte);
}

export function iconeSorte(sorte: FormeSorte): LucideIcon {
  if (sorte.champs.some((c) => c.type === 'formule' && c.des)) return Swords;
  if (sorte.activable) return Shield;
  if (sorte.quantites) return Layers;
  return Box;
}

export function ItemIcon({
  sorte,
  icone,
  image,
  className,
}: {
  sorte: FormeSorte;
  /** Icône choisie par la présentation ; absente : celle de la sorte. */
  icone?: LucideIcon | undefined;
  image?: string | undefined;
  className?: string;
}) {
  const Icone = icone ?? iconeSorte(sorte);
  if (image)
    return (
      <img
        src={image}
        alt=""
        aria-hidden
        className={cn('size-5 shrink-0 rounded object-cover', className)}
      />
    );
  return <Icone aria-hidden className={cn('size-4 shrink-0 text-subtle', className)} />;
}

/** Titre de section d'un panneau (« Bonus », « Formules »). */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-subtle">{children}</h3>
      {action}
    </div>
  );
}
