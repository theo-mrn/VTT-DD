import { cn } from '@/lib/utils';

/** Point du cercle à l'angle `a` (radians, 0 en haut, sens horaire). */
const point = (r: number, a: number) => [50 + r * Math.sin(a), 50 - r * Math.cos(a)] as const;

function segmentPath(i: number, n: number, r: number) {
  const gap = n > 1 ? 0.06 : 0;
  const a0 = (i / n) * Math.PI * 2 + gap / 2;
  const a1 = ((i + 1) / n) * Math.PI * 2 - gap / 2;
  const [x0, y0] = point(r, a0);
  const [x1, y1] = point(r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M50 50 L${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

/**
 * Cadran d'une horloge : un part par segment, les remplis teintés. Avec `onSegment`, chaque part
 * se clique (remplir jusqu'à elle, ou la vider si c'est la dernière remplie).
 */
export function ClockFace({
  segments,
  filled,
  className,
  onSegment,
  label,
}: Readonly<{
  segments: number;
  filled: number;
  className?: string;
  onSegment?: (index: number) => void;
  label: string;
}>) {
  const plein = filled >= segments;
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={label} className={cn('shrink-0', className)}>
      <circle
        cx="50"
        cy="50"
        r="48"
        className="fill-surface-2 stroke-border-strong"
        strokeWidth="2"
      />
      {Array.from({ length: segments }, (_, i) => (
        <path
          key={i}
          d={segmentPath(i, segments, 44)}
          onClick={onSegment ? () => onSegment(i) : undefined}
          className={cn(
            'transition-[fill] duration-300',
            i < filled ? (plein ? 'fill-destructive' : 'fill-primary') : 'fill-surface-3',
            onSegment && 'cursor-pointer hover:opacity-80',
          )}
        />
      ))}
    </svg>
  );
}
