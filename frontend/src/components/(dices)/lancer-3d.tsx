'use client';

/**
 * Animation 3D d'un lancer, facultative : réutilise le lanceur physique de
 * l'ancienne app (`(dices)/throw-fun`), avec la skin et la forme déclarées par
 * la présentation. Purement visuel : le résultat affiché est celui du moteur.
 *
 * Le canevas WebGL n'est chargé qu'à l'activation (import dynamique, sans
 * rendu serveur) : il précompile ses shaders par lots et reste coûteux.
 */
import dynamic from 'next/dynamic';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { FunDiceHandle } from './throw-fun';

const FunDiceThrower = dynamic(() => import('./throw-fun'), { ssr: false });

/** Formes connues du rendu 3D ; un d100 est lancé comme un d10. */
const FORMES_3D = new Set(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);

export interface De3D {
  /** Skin du catalogue 3D (`presentation.des.sortes.*.skin`) ; skin par défaut sinon. */
  skin?: string;
  /** Forme physique (`d6`, `d12`…). */
  forme: string;
}

export interface Lancer3DHandle {
  /** Lance ces dés à l'écran (au plus 12, décalés dans le temps). */
  lancer(des: De3D[]): void;
}

export const Lancer3D = forwardRef<Lancer3DHandle>(function Lancer3D(_props, ref) {
  const lanceur = useRef<FunDiceHandle>(null);

  useImperativeHandle(ref, () => ({
    lancer(des) {
      des.slice(0, 12).forEach((d, i) => {
        const forme = FORMES_3D.has(d.forme) ? d.forme : d.forme === 'd100' ? 'd10' : 'd6';
        window.setTimeout(() => lanceur.current?.roll(d.skin, forme), i * 90);
      });
    },
  }));

  return <FunDiceThrower ref={lanceur} hideButton />;
});
