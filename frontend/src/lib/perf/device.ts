/**
 * Capacités de la machine, pour doser le travail graphique (docs/performances.md) : une
 * machine modeste ou Windows (pilotes GPU fragiles, cf. TDR de Chrome sur les dés) reçoit des
 * réglages économes par défaut (moins d'images par seconde, pas d'antialiasing, effets figés).
 * Lu une fois : ces valeurs ne changent pas pendant la session.
 */

interface NavigatorPerf extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
  userAgentData?: { platform?: string };
}

const nav = (): NavigatorPerf | null =>
  typeof navigator === 'undefined' ? null : (navigator as NavigatorPerf);

let windows: boolean | null = null;
/** Windows (Chrome y plante sur les rafales GPU : pilotes et ANGLE/D3D). */
export function isWindows(): boolean {
  if (windows === null) {
    const n = nav();
    const platform = n?.userAgentData?.platform ?? n?.platform ?? '';
    windows = /win/i.test(platform);
  }
  return windows;
}

let lowEnd: boolean | null = null;
/** Machine modeste : 4 cœurs ou moins, 4 Go ou moins, ou économie de données demandée. */
export function isLowEndDevice(): boolean {
  if (lowEnd === null) {
    const n = nav();
    lowEnd = Boolean(
      n &&
      ((n.hardwareConcurrency !== undefined && n.hardwareConcurrency <= 4) ||
        (n.deviceMemory !== undefined && n.deviceMemory <= 4) ||
        n.connection?.saveData),
    );
  }
  return lowEnd;
}

/** Réglages économes par défaut : machine modeste ou Windows. */
export function prefersEconomy(): boolean {
  return isLowEndDevice() || isWindows();
}

/** Mouvement réduit demandé par le système. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
