'use client';

/**
 * Apparence des dés et des symboles, lue dans la présentation du système :
 * couleur, forme et libellé court des sortes de dé, icône lucide et couleur des
 * symboles et résultats. Replis génériques quand la présentation est absente.
 */
import { icons, type LucideProps } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { cn } from '@/lib/utils';

export type FormeDe = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100';

/** Accent par défaut des écrans (celui des pages de compte). */
export const ACCENT_DEFAUT = '#c9a965';

/** Couleur d'accent du thème du système, sinon celle de l'application. */
export function accentPresentation(presentation?: Presentation | null): string {
  return presentation?.theme?.couleurs.accent ?? ACCENT_DEFAUT;
}

/** Couleur stable dérivée d'un identifiant, quand la présentation n'en donne pas. */
function couleurDerivee(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 55%)`;
}

/** Couleur translucide (color-mix, jamais `var(--x)/N` qui ne génère rien avec Tailwind). */
export function attenuer(couleur: string, pourcentage: number): string {
  return `color-mix(in srgb, ${couleur} ${pourcentage}%, transparent)`;
}

/** Texte lisible (sombre ou clair) sur un fond de couleur hexadécimale. */
export function texteSur(couleur: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(couleur);
  if (!m) return '#fafafa';
  const hex =
    m[1]!.length === 3
      ? m[1]!
          .split('')
          .map((c) => c + c)
          .join('')
      : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#18181b' : '#fafafa';
}

// ─── Sortes de dé ────────────────────────────────────────────────────────────

export interface ApparenceSorte {
  id: string;
  nom: string;
  court: string;
  couleur: string;
  forme: FormeDe;
  original?: string;
  /** Skin 3D du catalogue de dés (animation facultative). */
  skin?: string;
}

const FORMES: FormeDe[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

/** Forme la plus proche du nombre de faces, quand la présentation n'en donne pas. */
function formeParFaces(faces: number): FormeDe {
  if (faces > 20) return 'd100';
  return FORMES.find((f) => Number(f.slice(1)) >= faces) ?? 'd20';
}

/** Apparence d'une sorte de dé à symboles du système (ou d'un dé numérique `d20`). */
export function apparenceSorte(
  id: string,
  systeme: SystemeCharge,
  presentation?: Presentation | null,
): ApparenceSorte {
  const sorte = systeme.source.des?.sortes.find((s) => s.id === id);
  const p = presentation?.des?.sortes[id];
  const faces = sorte?.faces.length ?? (Number(id.replace(/^d/, '')) || 6);
  const nom = sorte?.nom ?? id;
  return {
    id,
    nom,
    court: p?.court ?? nom,
    couleur: p?.couleur ?? couleurDerivee(id),
    forme: p?.forme ?? formeParFaces(faces),
    ...(p?.original ? { original: p.original } : {}),
    ...(p?.skin ? { skin: p.skin } : {}),
  };
}

/** Sortes de dé améliorées (cible d'une amélioration dans une action ou un effet du système). */
export function sortesAmeliorees(systeme: SystemeCharge): Set<string> {
  const vers = new Set<string>();
  for (const a of systeme.actions.values())
    if (a.jet.type === 'symboles') for (const x of a.jet.ameliorations) vers.add(x.vers);
  for (const e of systeme.entrees.values())
    for (const f of e.effets)
      if (f.sur === 'jet' && f.ajout && 'ameliorer' in f.ajout) vers.add(f.ajout.vers);
  return vers;
}

/** Contours des formes, dans une boîte 0..100. */
const CONTOURS: Record<FormeDe, string> = {
  d4: 'M50 6 L95 90 L5 90 Z',
  d6: 'M14 14 L86 14 L86 86 L14 86 Z',
  d8: 'M50 3 L96 50 L50 97 L4 50 Z',
  d10: 'M50 3 L94 42 L50 97 L6 42 Z',
  d12: 'M50 4 L96 38 L78 94 L22 94 L4 38 Z',
  d20: 'M50 3 L92 27 L92 73 L50 97 L8 73 L8 27 Z',
  d100: 'M50 4 A46 46 0 1 1 49.9 4 Z',
};

/** Dé dessiné à plat : forme et couleur de la sorte, contenu centré (face, symboles, compteur). */
export function DeForme({
  forme,
  couleur,
  taille = 44,
  plein = false,
  className,
  titre,
  children,
}: {
  forme: FormeDe;
  couleur: string;
  /** Côté en pixels. */
  taille?: number;
  /** Fond opaque (dé tiré) plutôt que translucide (touche). */
  plein?: boolean;
  className?: string;
  titre?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: taille, height: taille }}
      title={titre}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <path
          d={CONTOURS[forme]}
          fill={plein ? couleur : attenuer(couleur, 22)}
          stroke={couleur}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="relative flex flex-wrap items-center justify-center gap-px px-1 text-center font-semibold leading-none"
        style={{ color: plein ? texteSur(couleur) : couleur, fontSize: taille * 0.3 }}
      >
        {children}
      </span>
    </span>
  );
}

// ─── Symboles et résultats ───────────────────────────────────────────────────

/** `trending-up` → `TrendingUp`, clé de l'export `icons` de lucide-react. */
function nomComposant(icone: string): string {
  return icone
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1))
    .join('');
}

/** Icône lucide désignée par son nom kebab-case ; `null` si elle n'existe pas. */
export function IconeLucide({ nom, ...props }: { nom: string } & LucideProps) {
  const Icone = icons[nomComposant(nom) as keyof typeof icons];
  return Icone ? <Icone {...props} /> : null;
}

export interface ApparenceSymboleAffiche {
  cle: string;
  nom: string;
  court: string;
  couleur: string;
  icone?: string;
}

/** Apparence d'un symbole brut ou d'un résultat déclaré par le système. */
export function apparenceSymbole(
  cle: string,
  systeme: SystemeCharge,
  presentation?: Presentation | null,
): ApparenceSymboleAffiche {
  const des = systeme.source.des;
  const nom =
    des?.symboles.find((s) => s.id === cle)?.nom ??
    des?.resultats.find((r) => r.cle === cle)?.nom ??
    cle;
  const p = presentation?.symboles[cle];
  return {
    cle,
    nom,
    court: p?.court ?? nom,
    couleur: p?.couleur ?? '#d4d4d8',
    ...(p?.icone ? { icone: p.icone } : {}),
  };
}

/** Icône d'un symbole (lucide), repli sur son libellé court abrégé. */
export function IconeSymbole({
  apparence,
  taille = 16,
  couleur,
  className,
}: {
  apparence: ApparenceSymboleAffiche;
  taille?: number;
  /** Force la couleur (sur un dé plein, par exemple). */
  couleur?: string;
  className?: string;
}) {
  const style: CSSProperties = { color: couleur ?? apparence.couleur };
  const icone = apparence.icone ? (
    <IconeLucide
      nom={apparence.icone}
      size={taille}
      strokeWidth={2.5}
      className={className}
      style={style}
      aria-label={apparence.nom}
    />
  ) : null;
  return (
    icone ?? (
      <span
        className={cn('font-bold leading-none', className)}
        style={{ ...style, fontSize: taille * 0.75 }}
        title={apparence.nom}
      >
        {apparence.court.slice(0, 2)}
      </span>
    )
  );
}

/** Badge « icône + valeur » d'un résultat net ou d'un symbole. */
export function BadgeSymbole({
  apparence,
  valeur,
  className,
}: {
  apparence: ApparenceSymboleAffiche;
  valeur: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold',
        className,
      )}
      style={{
        borderColor: attenuer(apparence.couleur, 45),
        backgroundColor: attenuer(apparence.couleur, 12),
        color: apparence.couleur,
      }}
      title={apparence.nom}
    >
      <IconeSymbole apparence={apparence} taille={15} />
      <span className="tabular-nums">{valeur}</span>
      <span className="text-xs font-medium opacity-80">{apparence.court}</span>
    </span>
  );
}
