'use client';

import { AlertCircle, CheckCircle2, Info as IconeInfo, Loader2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export { aclonica, styleChamp, styleLabel, styleLien } from './styles';

// ─── Boutons ─────────────────────────────────────────────────────────────────

type Ton = 'dore' | 'secondaire' | 'danger' | 'discret';

const variantes: Record<Ton, ButtonProps['variant']> = {
  dore: 'default',
  secondaire: 'secondary',
  danger: 'destructive',
  discret: 'ghost',
};

/** Bouton des pages de compte (tons historiques → variantes du design system). */
export function Bouton({
  ton = 'dore',
  chargement = false,
  ...props
}: ButtonProps & { ton?: Ton; chargement?: boolean }) {
  return <Button variant={variantes[ton]} loading={chargement} {...props} />;
}

// ─── Mise en page ────────────────────────────────────────────────────────────

export function TitrePage({
  children,
  sousTitre,
}: Readonly<{ children: ReactNode; sousTitre?: ReactNode }>) {
  return (
    <header className="space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
        {children}
      </h1>
      {sousTitre && <p className="text-sm text-muted-foreground">{sousTitre}</p>}
    </header>
  );
}

export function Carte({
  titre,
  description,
  action,
  children,
  className,
}: Readonly<{
  titre?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border bg-card p-5 shadow-surface sm:p-6',
        className,
      )}
    >
      {(titre || action) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {titre && <h2 className="text-[15px] font-semibold tracking-tight">{titre}</h2>}
            {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Message({
  ton = 'erreur',
  children,
  className,
}: Readonly<{
  ton?: 'erreur' | 'succes' | 'info';
  children: ReactNode;
  className?: string;
}>) {
  const Icone = ton === 'succes' ? CheckCircle2 : ton === 'info' ? IconeInfo : AlertCircle;
  return (
    <p
      role={ton === 'erreur' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed',
        ton === 'erreur' && 'border-destructive/25 bg-destructive/10 text-destructive',
        ton === 'succes' && 'border-success/25 bg-success/10 text-success',
        ton === 'info' && 'border-primary/25 bg-primary/10 text-primary-strong',
        className,
      )}
    >
      <Icone className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

export function Chargement({ texte = 'Chargement…' }: Readonly<{ texte?: string }>) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin text-primary" />
      {texte}
    </div>
  );
}

export function Vide({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-subtle">
      {children}
    </p>
  );
}

/** Ligne de réglage avec interrupteur. */
export function Interrupteur({
  actif,
  onChange,
  label,
  description,
  disabled,
}: Readonly<{
  actif: boolean;
  onChange(actif: boolean): void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}>) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer space-y-0.5">
        <span className="block text-sm text-foreground">{label}</span>
        {description && <span className="block text-xs text-subtle">{description}</span>}
      </label>
      <Switch
        id={id}
        checked={actif}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
    </div>
  );
}

// ─── Avatar avec bordure ─────────────────────────────────────────────────────

/** Bordures de profil (mêmes identifiants que l'ancienne app). Toutes sauf « none » sont premium. */
export const BORDURES: { id: string; label: string; couleurs: string[] }[] = [
  { id: 'none', label: 'Aucune', couleurs: [] },
  { id: 'blue', label: 'Azur', couleurs: ['#3b82f6'] },
  { id: 'orange', label: 'Ambre', couleurs: ['#f97316'] },
  { id: 'magic', label: 'Arcane dorée', couleurs: ['#c9a965', '#f5d491', '#8a6d2f'] },
  { id: 'magic_purple', label: 'Arcane violette', couleurs: ['#9333ea', '#ec4899', '#6d28d9'] },
  { id: 'magic_green', label: 'Arcane verte', couleurs: ['#16a34a', '#84cc16', '#065f46'] },
  { id: 'magic_red', label: 'Arcane rouge', couleurs: ['#dc2626', '#f97316', '#7f1d1d'] },
  { id: 'magic_double', label: 'Double arcane', couleurs: ['#c9a965', '#3b82f6', '#c9a965'] },
  { id: 'magic_shine', label: 'Lueur', couleurs: ['#ffffff', '#c9a965', '#ffffff'] },
  { id: 'magic_shine_aurora', label: 'Aurore', couleurs: ['#10b981', '#06b6d4', '#8b5cf6'] },
  { id: 'magic_shine_solar', label: 'Solaire', couleurs: ['#fef08a', '#f97316', '#dc2626'] },
  { id: 'magic_shine_twilight', label: 'Crépuscule', couleurs: ['#1e3a8a', '#7c3aed', '#db2777'] },
];

const tailles = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-11 text-base',
  lg: 'size-20 text-2xl',
  xl: 'size-24 text-3xl sm:size-28',
};

export function AvatarJoueur({
  nom,
  url,
  bordure = 'none',
  taille = 'md',
  className,
}: Readonly<{
  nom: string;
  url: string | null | undefined;
  bordure?: string;
  taille?: keyof typeof tailles;
  className?: string;
}>) {
  const b = BORDURES.find((x) => x.id === bordure);
  const couleurs = b?.couleurs ?? [];
  const avatar = (
    <Avatar className={cn(tailles[taille], 'bg-surface-3')}>
      {url && <AvatarImage src={url} alt="" className="object-cover" />}
      <AvatarFallback className="flex size-full items-center justify-center bg-gradient-to-br from-surface-3 to-surface-2 font-semibold text-primary">
        {nom.charAt(0).toUpperCase() || '?'}
      </AvatarFallback>
    </Avatar>
  );

  if (couleurs.length === 0)
    return (
      <div className={cn('shrink-0 rounded-full ring-1 ring-white/10', className)}>{avatar}</div>
    );
  if (couleurs.length === 1)
    return (
      <div
        className={cn('shrink-0 rounded-full ring-2', className)}
        style={{ ['--tw-ring-color' as string]: couleurs[0] }}
      >
        {avatar}
      </div>
    );
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-full p-[2px]', className)}>
      <div
        aria-hidden
        className="absolute inset-[-50%] animate-[spin_5s_linear_infinite]"
        style={{ background: `conic-gradient(${[...couleurs, couleurs[0]].join(', ')})` }}
      />
      <div className="relative rounded-full bg-background p-px">{avatar}</div>
    </div>
  );
}

// ─── Formats ─────────────────────────────────────────────────────────────────

export function formaterDuree(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`;
}

export function formaterDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** « il y a 3 heures », « à l'instant »… */
export function formaterDepuis(iso: string | null | undefined) {
  if (!iso) return 'jamais';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '—';
  const secondes = Math.round((d - Date.now()) / 1000);
  if (Math.abs(secondes) < 60) return "à l'instant";
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const unites: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unite, duree] of unites)
    if (Math.abs(secondes) >= duree) return rtf.format(Math.round(secondes / duree), unite);
  return rtf.format(secondes, 'second');
}
