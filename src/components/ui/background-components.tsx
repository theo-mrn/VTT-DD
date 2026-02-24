"use client";

import { cn } from "@/lib/utils";

interface AppBackgroundProps {
  className?: string;
  children?: React.ReactNode;
}

/**
 * Background inspiré du dialog.tsx :
 * fond noir profond + léger reflet glass diagonal (from-white/5).
 */
export const AppBackground = ({ className, children }: AppBackgroundProps) => {
  return (
    <div
      className={cn(
        "relative min-h-screen w-full overflow-hidden",
        "bg-black",
        className
      )}
      style={{
        background: "linear-gradient(135deg, #2a2a2a 0%, #141414 40%, #050505 100%)",
      }}
    >
      {/* Glow principal — coin haut gauche, assez fort pour être visible */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 60% at 0% 0%, rgba(255,255,255,0.07) 0%, transparent 65%)",
        }}
      />

      {/* Contre-lumière douce — coin bas droit */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 55% 45% at 100% 100%, rgba(255,255,255,0.04) 0%, transparent 60%)",
        }}
      />

      {/* Grain subtil */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage: "url('/noise.png')",
          backgroundRepeat: "repeat",
          mixBlendMode: "overlay",
        }}
      />

      {/* Contenu */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
