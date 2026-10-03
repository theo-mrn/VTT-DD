'use client';

/**
 * Libellé qui s'adapte à sa place : le nom entier s'il tient sur une ligne, sinon la forme
 * courte (« Contact » → « CTT »). Mesuré en direct (redimensionnement du bloc, colonnes).
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function FittingLabel({
  long,
  short,
  className,
}: Readonly<{
  long: string;
  /** Forme courte ; absente ou identique : le nom entier, tronqué s'il déborde. */
  short?: string | undefined;
  className?: string;
}>) {
  const box = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [tight, setTight] = useState(false);
  const alt = short && short !== long ? short : null;

  useLayoutEffect(() => {
    const b = box.current;
    const m = measure.current;
    if (!alt || !b || !m) return;
    const check = () => setTight(m.offsetWidth > b.clientWidth);
    check();
    const obs = new ResizeObserver(check);
    obs.observe(b);
    return () => obs.disconnect();
  }, [alt, long]);

  return (
    <span ref={box} className={cn('relative block w-full truncate', className)} title={long}>
      {alt && tight ? alt : long}
      {alt && (
        // Largeur du nom entier, mesurée hors du flux
        <span
          ref={measure}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
        >
          {long}
        </span>
      )}
    </span>
  );
}
