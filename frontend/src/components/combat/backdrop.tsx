/**
 * Fond des fenêtres du combat, celui du lanceur de dés : trame de points estompée vers les
 * bords, halo d'accent depuis le coin haut gauche. Le parent porte `isolate` (le fond passe
 * sous le contenu sans le masquer).
 */
import { cn } from '@/lib/utils';

export type BackdropTone = 'primary' | 'danger' | 'info';

const HALO: Record<BackdropTone, string> = {
  primary: 'radial-gradient(90% 70% at 0% 0%, hsl(var(--primary) / 0.12), transparent 70%)',
  danger: 'radial-gradient(90% 70% at 0% 0%, hsl(var(--destructive) / 0.14), transparent 70%)',
  info: 'radial-gradient(90% 70% at 0% 0%, hsl(var(--info) / 0.12), transparent 70%)',
};

export function DotsBackdrop({
  tone = 'primary',
  className,
}: {
  tone?: BackdropTone;
  className?: string;
}) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 bg-dots opacity-70 mask-radial',
          className,
        )}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: HALO[tone] }}
      />
    </>
  );
}
