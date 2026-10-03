'use client';

/** Petits éléments partagés par les écrans du son. */
import type { AssetKind } from '@vtt/contracts';
import { AudioLines, Music, Wind, type LucideIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { ActivePill, PillGroup } from '@/components/ui/active-pill';
import { cn } from '@/lib/utils';

export const KIND_LABELS: Record<AssetKind, string> = {
  music: 'Musique',
  ambience: 'Ambiance',
  sfx: 'Effet',
};

export const KIND_ICONS: Record<AssetKind, LucideIcon> = {
  music: Music,
  ambience: Wind,
  sfx: AudioLines,
};

/** 83 000 ms → « 1:23 » ; au-delà d'une heure → « 1:02:03 ». */
export function formatTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–:––';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** Titre de section compact des panneaux. */
export function SectionTitle({
  children,
  action,
}: Readonly<{
  children: React.ReactNode;
  action?: React.ReactNode;
}>) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{children}</h3>
      {action}
    </div>
  );
}

/** Choix exclusif en boutons (clavier : flèches), pour peu d'options toujours visibles. */
export function Segmented({
  label,
  value,
  onChange,
  options,
}: Readonly<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: LucideIcon; count?: number }[];
}>) {
  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = ({ ArrowRight: 1, ArrowLeft: -1 } as Partial<Record<string, number>>)[e.key] ?? 0;
    if (!d) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const n = (i + d + options.length) % options.length;
    onChange(options[n]!.value);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[n]?.focus();
  };
  return (
    <PillGroup>
      <div
        role="radiogroup"
        aria-label={label}
        onKeyDown={clavier}
        className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1"
      >
        {options.map((o) => {
          const actif = o.value === value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={actif}
              tabIndex={actif ? 0 : -1}
              onClick={() => onChange(o.value)}
              className={cn(
                'relative isolate flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                actif ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {actif && <ActivePill className="bg-background shadow-surface" />}
              {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
              <span className="truncate">{o.label}</span>
              {o.count !== undefined && (
                <span className="text-[11px] tabular-nums text-subtle">{o.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </PillGroup>
  );
}
