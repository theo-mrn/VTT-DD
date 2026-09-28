'use client';

/** Petits éléments partagés par les écrans du son. */
import type { AssetKind } from '@vtt/contracts';
import { AudioLines, Music, Wind, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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

export const KIND_OPTIONS = (['music', 'ambience', 'sfx'] as const).map((k) => ({
  valeur: k,
  nom: KIND_LABELS[k],
}));

/** 83 000 ms → « 1:23 » ; au-delà d'une heure → « 1:02:03 ». */
export function formatTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–:––';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function KindBadge({ kind }: { kind: AssetKind }) {
  const Icon = KIND_ICONS[kind];
  return (
    <Badge ton={kind === 'music' ? 'primaire' : kind === 'ambience' ? 'info' : 'arcane'}>
      <Icon aria-hidden />
      {KIND_LABELS[kind]}
    </Badge>
  );
}

/** Titre de section compact des panneaux. */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{children}</h3>
      {action}
    </div>
  );
}
