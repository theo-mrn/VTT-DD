'use client';

/**
 * Le d20 du coin de la landing : un clic lance un d20 3D au skin tiré au sort (lanceur
 * « pour le plaisir », chargé seulement à la première intention : survol, focus ou appui).
 */
import Image from 'next/image';
import React from 'react';
import type { FunDiceHandle } from '@/components/dice/three/throw-fun';

type ThrowerModule = typeof import('@/components/dice/three/throw-fun');
type ThrowerComponent = ThrowerModule['FunDiceThrower'];

// Le lanceur 3D (three, cannon, r3f, carte d'environnement) reste hors du
// bundle de l'accueil : son module n'est importé qu'à la première intention
// (survol, focus ou appui sur le bouton). Import manuel plutôt que
// next/dynamic pour garder la ref impérative (roll, warm).
let throwerModule: Promise<ThrowerModule> | null = null;
const loadThrower = () => (throwerModule ??= import('@/components/dice/three/throw-fun'));

export function DeFlottant() {
  const throwerRef = React.useRef<FunDiceHandle>(null);
  const [Thrower, setThrower] = React.useState<ThrowerComponent | null>(null);
  // Lancer demandé avant l'arrivée du module : parti dès qu'il est monté.
  const pendingRoll = React.useRef(false);

  const ensureLoaded = React.useCallback(() => {
    if (Thrower) {
      throwerRef.current?.warm('d20');
      return;
    }
    loadThrower()
      .then((m) => setThrower(() => m.FunDiceThrower))
      .catch(() => {
        // Module indisponible (réseau) : on retentera à la prochaine intention.
        throwerModule = null;
      });
  }, [Thrower]);

  // Module monté : on lance le dé en attente, sinon on préchauffe le prochain.
  React.useEffect(() => {
    if (!Thrower || !throwerRef.current) return;
    if (pendingRoll.current) {
      pendingRoll.current = false;
      throwerRef.current.roll(undefined, 'd20');
    } else {
      throwerRef.current.warm('d20');
    }
  }, [Thrower]);

  const handleClick = () => {
    if (throwerRef.current) {
      throwerRef.current.roll(undefined, 'd20');
      return;
    }
    pendingRoll.current = true;
    ensureLoaded();
  };

  return (
    <div className="group fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
      <span className="pointer-events-none pr-1 text-[10px] uppercase tracking-[0.2em] text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
        Lancer un dé
      </span>
      <button
        onClick={handleClick}
        onPointerEnter={ensureLoaded}
        onPointerDown={ensureLoaded}
        onFocus={ensureLoaded}
        aria-label="Lancer un dé 20"
        className="relative flex size-16 cursor-pointer items-center justify-center transition-transform duration-300 hover:scale-110"
      >
        {/* Image cuite du dé (dice:bake) : aucun WebGL avant le premier lancer */}
        <Image
          src="/dice/thumbs/marbre_blanc.webp"
          alt=""
          width={128}
          height={128}
          draggable={false}
          className="pointer-events-none size-16 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
        />
      </button>
      {Thrower && <Thrower ref={throwerRef} hideButton defaultDiceType="d20" />}
    </div>
  );
}
