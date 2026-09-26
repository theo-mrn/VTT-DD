'use client';

/**
 * Animation 3D d'un lancer, facultative : réutilise le lanceur physique de
 * l'ancienne app (`(dices)/throw-fun`), avec la skin et la forme déclarées par
 * la présentation. Le résultat vient du moteur (serveur) : passer `value` fait
 * atterrir le dé sur cette face (mécanisme de l'ancien lanceur : le dé est
 * basculé sur la face voulue quand il s'arrête) ; `faces` remplace les numéros
 * par les symboles des faces déclarées (dés à symboles). `dice-3d-input.ts`
 * construit ces dés depuis un résultat de `@vtt/rules`.
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
  /**
   * Résultat imposé (serveur) : nombre lu sur un dé numérique, numéro de face
   * déclarée (1 = première) sur un dé à symboles. Atterrissage libre sinon.
   * Ignoré pour un d100 (lancé comme un d10).
   */
  value?: number;
  /** Dé à symboles : symboles de chaque face déclarée, dans l'ordre (index 0 = face 1). */
  faces?: Die3DSymbol[][];
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
        const known = SHAPES_3D.has(d.shape);
        const shape = known ? d.shape : d.shape === 'd100' ? 'd10' : 'd6';
        const target = { value: known ? d.value : undefined, faces: d.faces };
        window.setTimeout(() => thrower.current?.roll(d.skin, shape, target), i * 90);
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
