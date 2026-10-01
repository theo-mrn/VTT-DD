'use client';
import React from 'react';
import type { FunDiceHandle } from '@/components/(dices)/throw-fun';

type ThrowerModule = typeof import('@/components/(dices)/throw-fun');
type ThrowerComponent = ThrowerModule['FunDiceThrower'];

// Le lanceur 3D (three, cannon, r3f, carte d'environnement) reste hors du
// bundle de l'accueil : son module n'est importé qu'à la première intention
// (survol, focus ou appui sur le bouton). Import manuel plutôt que
// next/dynamic pour garder la ref impérative (roll, warm).
let throwerModule: Promise<ThrowerModule> | null = null;
const loadThrower = () => (throwerModule ??= import('@/components/(dices)/throw-fun'));

export function DiceWidget() {
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
    <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2 group">
      <span className="font-logo text-[10px] text-white/40 tracking-widest uppercase pr-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Lancer un dé
      </span>
      <button
        onClick={handleClick}
        onPointerEnter={ensureLoaded}
        onPointerDown={ensureLoaded}
        onFocus={ensureLoaded}
        aria-label="Lancer un dé 20"
        className="relative w-16 h-16 flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-110"
      >
        <div className="relative w-16 h-16 pointer-events-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
          {/* Image précalculée du dé (même rendu que la carte de la boutique,
              dont l'aperçu 3D au survol était de toute façon inaccessible ici) */}
          <img
            src="/dice/thumbs/marbre_blanc.webp"
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      </button>
      {Thrower && <Thrower ref={throwerRef} hideButton defaultDiceType="d20" />}
    </div>
  );
}
