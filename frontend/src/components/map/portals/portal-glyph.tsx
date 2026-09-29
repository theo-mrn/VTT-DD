/**
 * Glyphes des portails en SVG (escalier, porte, portail, échelle) : le même dessin que sur la
 * carte (`lib/map/modules/portals/glyphs.ts`), à la couleur du texte (`currentColor`).
 */
import type { MapPortalIcon } from '@vtt/contracts';
import { GLYPH_HALF, GLYPH_STROKE, GLYPHS } from '@/lib/map/modules/portals/glyphs';
import { cn } from '@/lib/utils';

export function PortalGlyph({
  icon,
  className,
}: {
  icon: MapPortalIcon | null | undefined;
  className?: string;
}) {
  const parts = GLYPHS[icon ?? 'portal'] ?? GLYPHS.portal;
  const m = GLYPH_HALF + 1;
  return (
    <svg
      viewBox={`${-m} ${-m} ${2 * m} ${2 * m}`}
      className={cn('size-4', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={GLYPH_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {parts.map((part, i) => {
        if (part.type === 'circle')
          return (
            <circle
              key={i}
              cx={part.x}
              cy={part.y}
              r={part.r}
              fill={part.fill ? 'currentColor' : 'none'}
              stroke={part.fill ? 'none' : 'currentColor'}
            />
          );
        if (part.type === 'rect')
          return <rect key={i} x={part.x} y={part.y} width={part.w} height={part.h} rx={part.r} />;
        const pts: string[] = [];
        for (let j = 0; j < part.points.length; j += 2)
          pts.push(`${part.points[j]},${part.points[j + 1]}`);
        return part.fill || part.closed ? (
          <polygon
            key={i}
            points={pts.join(' ')}
            fill={part.fill ? 'currentColor' : 'none'}
            stroke={part.fill ? 'none' : 'currentColor'}
          />
        ) : (
          <polyline key={i} points={pts.join(' ')} />
        );
      })}
    </svg>
  );
}

/** Icône de l'outil « Portails » (la spirale). */
export function PortalToolIcon({ className }: { className?: string }) {
  return <PortalGlyph icon="portal" className={className} />;
}
