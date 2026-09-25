"use client";

import { cn } from "@/lib/utils";

interface BorderBeamProps {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  className?: string;
  borderWidth?: number;
}

export const BorderBeam = ({
  duration = 6,
  delay = 0,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  className,
  borderWidth = 3,
}: BorderBeamProps) => {
  return (
    <div
      style={{
        mask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
        WebkitMask: "linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)",
        maskComposite: "exclude",
        WebkitMaskComposite: "xor",
        "--border-width": borderWidth,
      } as any}
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] border-[calc(var(--border-width)*1px)] border-transparent",
        className
      )}
    >
      <div
        style={{
          animationDelay: `-${delay}s`,
          animationDuration: `${duration}s`,
          backgroundImage: `conic-gradient(from 90deg at 50% 50%, transparent 60%, ${colorFrom} 80%, ${colorTo} 100%)`,
        }}
        className="absolute inset-[-100%] animate-spin"
      />
    </div>
  );
};
