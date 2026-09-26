/**
 * Symboles dessinés sur les faces d'un dé à symboles lancé en 3D (`throw.tsx`) :
 * faces déclarées par le système (`des.sortes[].faces`), icône et couleur de
 * `presentation.symboles`. Aucune clé de jeu ici : tout vient du système.
 */
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { symbolAppearance } from './appearance';
import type { Die3DSymbol } from './throw-3d';

/** Symboles de chaque face déclarée d'une sorte de dé (index 0 = face 1), `undefined` si inconnue. */
export function symbolFaces3D(
  kindId: string,
  system: SystemeCharge,
  presentation?: Presentation | null,
): Die3DSymbol[][] | undefined {
  const kind = system.source.des?.sortes.find((s) => s.id === kindId);
  if (!kind) return undefined;
  return kind.faces.map((face) =>
    Object.entries(face).flatMap(([key, count]) => {
      const a = symbolAppearance(key, system, presentation);
      const symbol: Die3DSymbol = {
        label: a.short,
        ...(a.icon ? { icon: a.icon } : {}),
        ...(presentation?.symboles[key]?.couleur ? { color: a.color } : {}),
      };
      return Array.from({ length: count }, () => symbol);
    }),
  );
}
