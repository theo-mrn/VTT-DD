'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export { aclonica, styleChamp, styleLabel, styleLien } from './styles';
import { aclonica } from './styles';

// ─── Boutons ─────────────────────────────────────────────────────────────────

type Ton = 'dore' | 'secondaire' | 'danger' | 'discret';

const tons: Record<Ton, string> = {
  dore: 'bg-[#c9a965] text-zinc-950 font-semibold hover:bg-[#d8bb7a] shadow-none',
  secondaire:
    'border border-zinc-700 bg-transparent text-zinc-200 hover:border-[#c9a965] hover:bg-zinc-800/60 hover:text-white shadow-none',
  danger:
    'border border-red-500/40 bg-transparent text-red-400 hover:border-red-400 hover:bg-red-500/10 shadow-none',
  discret: 'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-white shadow-none',
};

export function Bouton({
  ton = 'dore',
  chargement = false,
  className,
  children,
  disabled,
  asChild,
  ...props
}: ButtonProps & { ton?: Ton; chargement?: boolean }) {
  return (
    <Button
      className={cn('rounded-lg', tons[ton], className)}
      disabled={disabled || chargement}
      asChild={asChild}
      {...props}
    >
      {/* Avec asChild, Slot exige un enfant unique */}
      {asChild ? (
        children
      ) : (
        <>
          {chargement && <Loader2 className="animate-spin" />}
          {children}
        </>
      )}
    </Button>
  );
}

// ─── Mise en page ────────────────────────────────────────────────────────────

export function TitrePage({ children, sousTitre }: { children: ReactNode; sousTitre?: ReactNode }) {
  return (
    <header className="space-y-1">
      <h1 className={cn(aclonica, 'text-2xl tracking-wide text-white sm:text-3xl')}>{children}</h1>
      {sousTitre && <p className="text-sm text-zinc-400">{sousTitre}</p>}
    </header>
  );
}

export function Carte({
  titre,
  description,
  action,
  children,
  className,
}: {
  titre?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6', className)}>
      {(titre || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {titre && <h2 className={cn(aclonica, 'text-lg text-white')}>{titre}</h2>}
            {description && <p className="text-sm text-zinc-400">{description}</p>}
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
}: {
  ton?: 'erreur' | 'succes' | 'info';
  children: ReactNode;
  className?: string;
}) {
  const Icone = ton === 'succes' ? CheckCircle2 : AlertCircle;
  return (
    <p
      role={ton === 'erreur' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        ton === 'erreur' && 'border-red-500/30 bg-red-500/10 text-red-300',
        ton === 'succes' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        ton === 'info' && 'border-[#c9a965]/30 bg-[#c9a965]/10 text-[#e2cc97]',
        className,
      )}
    >
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

export function Chargement({ texte = 'Chargement…' }: { texte?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
      <Loader2 className="h-4 w-4 animate-spin text-[#c9a965]" />
      {texte}
    </div>
  );
}

export function Vide({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
      {children}
    </p>
  );
}

/** Interrupteur accessible (role="switch"). */
export function Interrupteur({
  actif,
  onChange,
  label,
  description,
  disabled,
}: {
  actif: boolean;
  onChange(actif: boolean): void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0 space-y-0.5">
        <span className="block text-sm text-zinc-200">{label}</span>
        {description && <span className="block text-xs text-zinc-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={actif}
        disabled={disabled}
        onClick={() => onChange(!actif)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          actif ? 'border-[#c9a965] bg-[#c9a965]' : 'border-zinc-700 bg-zinc-800',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 rounded-full shadow transition-transform',
            actif ? 'translate-x-6 bg-zinc-950' : 'translate-x-1 bg-zinc-400',
          )}
        />
      </button>
    </label>
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
  sm: 'h-9 w-9 text-sm',
  md: 'h-12 w-12 text-lg',
  lg: 'h-20 w-20 text-2xl',
  xl: 'h-24 w-24 text-3xl sm:h-28 sm:w-28',
};

export function AvatarJoueur({
  nom,
  url,
  bordure = 'none',
  taille = 'md',
  className,
}: {
  nom: string;
  url: string | null | undefined;
  bordure?: string;
  taille?: keyof typeof tailles;
  className?: string;
}) {
  const b = BORDURES.find((x) => x.id === bordure);
  const couleurs = b?.couleurs ?? [];
  const avatar = (
    <Avatar className={cn(tailles[taille], 'bg-zinc-800')}>
      {url && <AvatarImage src={url} alt="" className="object-cover" />}
      <AvatarFallback className="flex h-full w-full items-center justify-center bg-zinc-800 font-semibold text-[#c9a965]">
        {nom.charAt(0).toUpperCase() || '?'}
      </AvatarFallback>
    </Avatar>
  );

  if (couleurs.length === 0)
    return (
      <div className={cn('shrink-0 rounded-full ring-2 ring-zinc-700', className)}>{avatar}</div>
    );
  if (couleurs.length === 1)
    return (
      <div
        className={cn('shrink-0 rounded-full ring-[3px]', className)}
        style={{ ['--tw-ring-color' as string]: couleurs[0] }}
      >
        {avatar}
      </div>
    );
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-full p-[3px]', className)}>
      <div
        aria-hidden
        className="absolute inset-[-50%] animate-[spin_5s_linear_infinite]"
        style={{ background: `conic-gradient(${[...couleurs, couleurs[0]].join(', ')})` }}
      />
      <div className="relative rounded-full bg-[#0c0c0e]">{avatar}</div>
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
