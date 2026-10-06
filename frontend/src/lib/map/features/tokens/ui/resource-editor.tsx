'use client';

/**
 * Ressource principale d'un personnage (PV…), modifiable sur place : barre du groupe, panneau de
 * la sélection. − et + (Maj : 5), saisie directe, pleine forme (0 pour une ressource qui se
 * remplit). Les clics rapprochés font une seule écriture.
 */
import { HeartPulse, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import type { ResourceGauge } from '../engine/model';
import { useOperationsPersonnage } from '@/lib/personnages';
import { cn } from '@/lib/utils';

/**
 * Ressource principale : − et + (Maj : 5), saisie directe, pleine forme. Les clics rapprochés
 * sont regroupés en une seule écriture.
 */
export function ResourceEditor({
  characterId,
  resource: r,
}: Readonly<{
  characterId: string;
  resource: ResourceGauge;
}>) {
  const ops = useOperationsPersonnage(characterId);
  const [value, setValue] = useState(r.value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Valeur relue (écriture ailleurs) : le champ suit, sauf pendant une saisie en cours
  useEffect(() => {
    if (!timer.current) setValue(r.value);
  }, [r.value]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const clamp = (v: number) => Math.max(0, Math.min(r.max, Math.round(v)));
  const commit = (v: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (v === r.value) return;
      ops.valeurs({ [r.key]: v }).catch((err: unknown) => {
        setValue(r.value);
        toast.error(`${r.label} non enregistrés`, { description: messageErreur(err) });
      });
    }, 450);
  };
  const set = (v: number) => {
    const next = clamp(v);
    setValue(next);
    commit(next);
  };
  const full = r.rising ? 0 : r.max;
  const step = (e: { shiftKey: boolean }) => (e.shiftKey ? 5 : 1);

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={`Retirer des ${r.label}`}
        onClick={(e) => set(value - step(e))}
      >
        <Minus />
      </Button>
      <div className="relative flex-1">
        <Input
          type="number"
          inputMode="numeric"
          value={value}
          min={0}
          max={r.max}
          onChange={(e) => set(Number(e.target.value))}
          aria-label={r.label}
          className={cn(
            'h-8 pr-10 text-center font-mono font-semibold tabular-nums',
            value !== r.value && 'text-primary-strong',
          )}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs tabular-nums text-subtle">
          / {r.max}
        </span>
      </div>
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={`Ajouter des ${r.label}`}
        onClick={(e) => set(value + step(e))}
      >
        <Plus />
      </Button>
      <Info texte={r.rising ? 'Indemne' : 'Pleine forme'}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={r.rising ? 'Indemne' : 'Pleine forme'}
          disabled={value === full}
          onClick={() => set(full)}
        >
          <HeartPulse />
        </Button>
      </Info>
    </div>
  );
}
