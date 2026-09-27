'use client';

/**
 * Curseur, même API que `@/components/ui/slider` de l'ancienne app (Radix,
 * absent du nouveau front) pour une seule poignée : `value={[n]}`,
 * `onValueChange([n])`, `min`, `max`, `step`. Repose sur `<input type=range>`.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

interface SliderProps {
  value?: number[];
  defaultValue?: number[];
  onValueChange?(value: number[]): void;
  onValueCommit?(value: number[]): void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function Slider({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
  id,
}: SliderProps) {
  const [inner, setInner] = React.useState(defaultValue?.[0] ?? min);
  const current = value?.[0] ?? inner;
  const percent = max > min ? ((current - min) / (max - min)) * 100 : 0;
  return (
    <div className={cn('relative flex w-full touch-none select-none items-center', className)}>
      <div className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-secondary)_25%,transparent)]">
        <div
          className="absolute h-full bg-[var(--accent-brown)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          setInner(n);
          onValueChange?.([n]);
        }}
        onPointerUp={(e) => onValueCommit?.([Number((e.target as HTMLInputElement).value)])}
        onKeyUp={(e) => onValueCommit?.([Number((e.target as HTMLInputElement).value)])}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute block h-4 w-4 -translate-x-1/2 rounded-full border-2 border-[var(--accent-brown)] bg-[var(--bg-dark)] shadow"
        style={{ left: `${percent}%` }}
      />
    </div>
  );
}

export { Slider };
