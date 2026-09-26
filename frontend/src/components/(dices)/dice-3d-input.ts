/**
 * Dés 3D à lancer pour un résultat du moteur de règles (`@vtt/rules`) : forme
 * et skin de la présentation, face tirée par le serveur, symboles des faces
 * déclarées par le système (`des.sortes[].faces`) avec l'icône de
 * `presentation.symboles`. Aucune clé de jeu ici : tout vient du système.
 */
import type { DeSymbole, JetDes, Presentation, SystemeCharge } from '@vtt/rules';
import { kindAppearance, symbolAppearance } from './appearance';
import type { Die3D, Die3DSymbol } from './throw-3d';

/** Dés d'un lancer à symboles (`JetSymbolesResultat.des`, `LancerSymboles.des`). */
export function symbolDice3D(
  dice: DeSymbole[],
  system: SystemeCharge,
  presentation?: Presentation | null,
): Die3D[] {
  const faceCache = new Map<string, Die3DSymbol[][]>();
  const facesOf = (kindId: string): Die3DSymbol[][] | undefined => {
    const kind = system.source.des?.sortes.find((s) => s.id === kindId);
    if (!kind) return undefined;
    let faces = faceCache.get(kindId);
    if (!faces) {
      faces = kind.faces.map((face) =>
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
      faceCache.set(kindId, faces);
    }
    return faces;
  };

  return dice.map((d) => {
    const a = kindAppearance(d.de, system, presentation);
    const faces = facesOf(d.de);
    return {
      shape: a.shape,
      value: d.face,
      ...(a.skin ? { skin: a.skin } : {}),
      ...(faces ? { faces } : {}),
    };
  });
}

/** Dés d'un jet numérique (`JetNumeriqueResultat.jets`, `rollNotation().rolls`). */
export function numericDice3D(
  rolls: JetDes[],
  system: SystemeCharge,
  presentation?: Presentation | null,
): Die3D[] {
  return rolls.flatMap((r) => {
    const a = kindAppearance(`d${r.faces}`, system, presentation);
    return r.des.map((d) => ({
      shape: a.shape,
      value: d.valeur,
      ...(a.skin ? { skin: a.skin } : {}),
    }));
  });
}
