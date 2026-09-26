'use client';

/**
 * Animation 3D d'un lancer, facultative et purement visuelle : réutilise le
 * lanceur « fun » de l'ancienne app (`(dices)/throw-fun`), avec la skin et la
 * forme déclarées par la présentation. Les dés atterrissent librement ; le
 * panneau de dés, lui, passe par `throw.tsx` où la face lue sur chaque dé fait
 * le résultat.
 *
 * Le canevas WebGL n'est chargé qu'à l'activation (import dynamique, sans
 * rendu serveur) : il précompile ses shaders par lots et reste coûteux.
 */
import dynamic from 'next/dynamic';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { FunDiceHandle } from './throw-fun';

const FunDiceThrower = dynamic(() => import('./throw-fun'), { ssr: false });

/** Formes connues du rendu 3D ; un d100 est lancé comme un d10. */
const SHAPES_3D = new Set(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);

/** Un symbole dessiné sur une face (dé à symboles). */
export interface Die3DSymbol {
  /** Icône lucide (`presentation.symboles.*.icone`). */
  icon?: string;
  /** Repli quand l'icône manque ou est inconnue (2 caractères affichés). */
  label?: string;
  /** Couleur du symbole ; celle des numéros de la skin sinon. */
  color?: string;
}

export interface Die3D {
  /** Skin du catalogue 3D (`presentation.des.sortes.*.skin`) ; skin par défaut sinon. */
  skin?: string;
  /** Forme physique (`d6`, `d12`…). */
  shape: string;
}

export interface Throw3DHandle {
  /** Lance ces dés à l'écran (au plus 12, décalés dans le temps). */
  roll(dice: Die3D[]): void;
}

export const Throw3D = forwardRef<Throw3DHandle>(function Throw3D(_props, ref) {
  const thrower = useRef<FunDiceHandle>(null);

  useImperativeHandle(ref, () => ({
    roll(dice) {
      dice.slice(0, 12).forEach((d, i) => {
        const shape = SHAPES_3D.has(d.shape) ? d.shape : d.shape === 'd100' ? 'd10' : 'd6';
        window.setTimeout(() => thrower.current?.roll(d.skin, shape), i * 90);
      });
    },
  }));

  // Out of the page flow: the thrower's canvas is a fixed full-screen overlay,
  // its wrapper must not take a cell of the caller's grid or flex layout.
  return (
    <div aria-hidden style={{ position: 'absolute', width: 0, height: 0 }}>
      <FunDiceThrower ref={thrower} hideButton />
    </div>
  );
});
