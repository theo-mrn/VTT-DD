'use client';

/**
 * Panneau « Bientôt disponible » : prend la place d'un tiroir ou d'une fenêtre
 * de l'ancienne carte qui n'a pas encore d'équivalent côté serveur
 * (bibliothèques de PNJ, d'objets et de sons, recherche unifiée…). Le bouton
 * qui l'ouvre reste en place : il affiche ce panneau au lieu de ne rien faire.
 */
import { Clock, X } from 'lucide-react';

export function ComingSoonPanel({
  isOpen,
  title,
  description,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose(): void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed right-4 top-20 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-[var(--text-primary)] shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-[color-mix(in_srgb,var(--accent-brown)_15%,transparent)] p-2">
          <Clock className="h-4 w-4 text-[var(--accent-brown)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {description ?? 'Bientôt disponible sur la nouvelle table de jeu.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
