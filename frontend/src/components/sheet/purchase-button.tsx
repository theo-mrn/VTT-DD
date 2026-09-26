'use client';

import type { ObjetAchetable } from '@vtt/rules';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { iconButton } from './styles';

/** Achat d'un objet : coût affiché, raisons du blocage au survol et pour les lecteurs d'écran. */
export function PurchaseButton({
  item,
  label,
  currency,
  onBuy,
  buttonText,
  compact,
}: {
  item: ObjetAchetable;
  label: string;
  currency: string;
  onBuy(): Promise<boolean>;
  buttonText?: string;
  /** Petit bouton, posé dans le coin d'une case. */
  compact?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const reason = item.blocages.map((b) => b.message).join(' ; ');
  return (
    <button
      type="button"
      className={cn(
        iconButton,
        'w-auto gap-1 tabular-nums',
        compact
          ? 'h-6 gap-0.5 bg-[color:var(--fiche-carte)] px-1.5 text-[10px] [&_svg]:h-3 [&_svg]:w-3'
          : 'px-2 text-xs',
      )}
      disabled={!item.possible || sending}
      title={item.possible ? `${label} : ${item.cout} ${currency}` : reason}
      aria-label={`${label} : ${item.cout} ${currency}${item.possible ? '' : ` (impossible : ${reason})`}`}
      onClick={async () => {
        setSending(true);
        await onBuy();
        setSending(false);
      }}
    >
      <Plus className="h-3.5 w-3.5" />
      {buttonText ?? item.cout}
    </button>
  );
}
