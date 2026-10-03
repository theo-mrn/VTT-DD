"use client"

import type React from "react"

/**
 * Bouton d'action à bordure animée (dégradé conique tournant + pointillés + shimmer interne).
 * Utilisé par le menu contextuel des personnages quand le système de jeu actif est à dés à symboles
 * (Star Wars EotE, cf ContextMenuPanel) — les autres systèmes gardent les boutons standards.
 *
 * `accent`/`accentSubtle` paramètrent la couleur de l'effet : rouge sabre pour l'attaque, jaune
 * impérial pour les interactions. Les animations ne tournent qu'au survol/focus
 * (animation-play-state), pour ne pas laisser des dégradés animés en permanence sur la carte.
 */
export interface ShinyActionButtonProps {
  children: React.ReactNode
  onClick?: () => void
  /** Couleur principale de l'effet lumineux. */
  accent?: string
  /** Couleur secondaire, utilisée au survol pour la partie la plus brillante du dégradé. */
  accentSubtle?: string
  className?: string
  title?: string
}

export function ShinyActionButton({
  children,
  onClick,
  accent = "#ffe81f",
  accentSubtle = "#c9b400",
  className = "",
  title,
}: ShinyActionButtonProps) {
  return (
    <>
      <style jsx>{`
        @property --sab-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
        @property --sab-angle-offset {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
        @property --sab-percent {
          syntax: "<percentage>";
          initial-value: 5%;
          inherits: false;
        }
        @property --sab-shine {
          syntax: "<color>";
          initial-value: white;
          inherits: false;
        }

        .sab {
          --sab-bg: #0a0a0b;
          --sab-bg-subtle: #1a1818;
          --animation: sab-angle-spin linear infinite;
          --duration: 3s;
          --shadow-size: 2px;
          --transition: 800ms cubic-bezier(0.25, 1, 0.5, 1);

          isolation: isolate;
          position: relative;
          overflow: hidden;
          cursor: pointer;
          outline-offset: 4px;
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          height: 2rem;
          padding: 0 0.875rem;
          font-size: 0.75rem;
          font-weight: 600;
          line-height: 1;
          border: 1px solid transparent;
          border-radius: 9999px;
          color: #fff;
          background:
            linear-gradient(var(--sab-bg), var(--sab-bg)) padding-box,
            conic-gradient(
                from calc(var(--sab-angle) - var(--sab-angle-offset)),
                transparent,
                var(--sab-accent) var(--sab-percent),
                var(--sab-shine) calc(var(--sab-percent) * 2),
                var(--sab-accent) calc(var(--sab-percent) * 3),
                transparent calc(var(--sab-percent) * 4)
              )
              border-box;
          box-shadow: inset 0 0 0 1px var(--sab-bg-subtle);
          transition: var(--transition);
          transition-property: --sab-angle-offset, --sab-percent, --sab-shine;
        }

        .sab::before,
        .sab::after,
        .sab :global(span)::before {
          content: "";
          pointer-events: none;
          position: absolute;
          inset-inline-start: 50%;
          inset-block-start: 50%;
          translate: -50% -50%;
          z-index: -1;
        }

        .sab:active {
          translate: 0 1px;
        }

        /* Trame de points */
        .sab::before {
          --size: calc(100% - var(--shadow-size) * 3);
          --position: 2px;
          --space: calc(var(--position) * 2);
          width: var(--size);
          height: var(--size);
          background: radial-gradient(
              circle at var(--position) var(--position),
              white calc(var(--position) / 4),
              transparent 0
            )
            padding-box;
          background-size: var(--space) var(--space);
          background-repeat: space;
          mask-image: conic-gradient(
            from calc(var(--sab-angle) + 45deg),
            black,
            transparent 10% 90%,
            black
          );
          border-radius: 9999px;
          opacity: 0.4;
          z-index: -1;
        }

        /* Reflet interne */
        .sab::after {
          --animation: sab-shimmer linear infinite;
          width: 100%;
          aspect-ratio: 1;
          background: linear-gradient(
            -50deg,
            transparent,
            var(--sab-accent),
            transparent
          );
          mask-image: radial-gradient(circle at bottom, transparent 40%, black);
          opacity: 0.6;
        }

        .sab,
        .sab::before,
        .sab::after {
          animation:
            var(--animation) var(--duration),
            var(--animation) calc(var(--duration) / 0.4) reverse paused;
          animation-composition: add;
        }

        .sab:is(:hover, :focus-visible) {
          --sab-percent: 20%;
          --sab-angle-offset: 95deg;
          --sab-shine: var(--sab-accent-subtle);
        }

        .sab:is(:hover, :focus-visible),
        .sab:is(:hover, :focus-visible)::before,
        .sab:is(:hover, :focus-visible)::after {
          animation-play-state: running;
        }

        @keyframes sab-angle-spin {
          to {
            --sab-angle: 360deg;
          }
        }

        @keyframes sab-shimmer {
          to {
            rotate: 360deg;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sab,
          .sab::before,
          .sab::after {
            animation: none;
          }
        }
      `}</style>

      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`sab ${className}`}
        style={
          {
            "--sab-accent": accent,
            "--sab-accent-subtle": accentSubtle,
          } as React.CSSProperties
        }
      >
        <span className="relative z-[1] inline-flex items-center gap-1.5">
          {children}
        </span>
      </button>
    </>
  )
}
