'use client';

/**
 * Dialogue aux couleurs de la fiche, dans l'esprit des dialogues de détail de
 * l'ancienne fiche (fond transparent, liseré animé, titre en dégradé). Rendu
 * hors du cadre (portail) : il repose lui-même les variables du thème.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { gradientTitle, text, textMuted, titleFont } from './styles';

const SIZES = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'max-w-[95vw] xl:max-w-6xl',
  full: 'max-w-[95vw] xl:max-w-7xl',
} as const;

export function EntryDialog({
  open,
  onClose,
  title,
  description,
  badges,
  children,
  footer,
  size = 'md',
  themeVariables,
  bare,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  /** Sous-titre ; sinon le titre est repris pour les lecteurs d'écran. */
  description?: ReactNode;
  /** Pastilles à droite du titre (marques…). */
  badges?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  themeVariables?: CSSProperties;
  /** Pas d'en-tête : le contenu gère son propre titre (codex). */
  bare?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent borderTrail className={SIZES[size]}>
        <div
          style={themeVariables}
          className={cn(text, 'font-[family-name:var(--fiche-police-corps)]', !bare && 'space-y-4')}
        >
          <DialogTitle
            className={cn(
              !bare
                ? cn(titleFont, gradientTitle, 'pr-8 text-2xl font-bold leading-tight')
                : 'sr-only',
            )}
          >
            {title}
          </DialogTitle>
          <DialogDescription className={cn(textMuted, 'text-xs', !description && 'sr-only')}>
            {description ?? title}
          </DialogDescription>
          {badges && !bare && <div className="-mt-2 flex flex-wrap gap-1.5">{badges}</div>}
          <div className={cn(!bare && 'max-h-[70vh] overflow-y-auto pr-1')}>{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/5 pt-4">
              {footer}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
