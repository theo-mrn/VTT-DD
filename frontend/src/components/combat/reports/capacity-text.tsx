'use client';

/**
 * Texte complet de la capacité jouée par un acte (docs/combat.md § 19.1), dans les rapports du
 * MJ : c'est lui qui applique ce qu'elle fait au-delà des dés, des soins et des effets donnés.
 */
import type { Attack } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { capaciteDeLActe } from '@/lib/combat/capacities';
import { cn } from '@/lib/utils';

export function CapacityText({
  systeme,
  presentation,
  attack,
  className,
}: Readonly<{
  systeme: SystemeCharge | null | undefined;
  presentation: Presentation | null | undefined;
  attack: Pick<Attack, 'action' | 'params'>;
  className?: string;
}>) {
  const capacite = capaciteDeLActe(systeme, presentation, attack.action.id, attack.params);
  const texte = capacite?.description?.trim();
  if (!capacite || !texte) return null;
  return (
    <section
      aria-label={capacite.nom}
      className={cn('rounded-lg border border-border bg-surface-2/60 px-3 py-2', className)}
    >
      <p className="pb-1 text-xs font-semibold">{capacite.nom}</p>
      <p className="max-h-60 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-muted-foreground [scrollbar-width:thin]">
        {texte}
      </p>
    </section>
  );
}
