'use client';
import dynamic from 'next/dynamic';
import React from 'react';
import type { FunDiceHandle } from '@/components/(dices)/throw-fun';
import { cn } from '@/lib/utils';
import { Aclonica } from 'next/font/google';

const aclonica = Aclonica({
  weight: '400',
  subsets: ['latin'],
});

const SKIN = 'marbre_blanc';
const STILL = `/dice/${SKIN}.png`;

// three.js stays out of the landing's first render: the thrower (canvas,
// shader warm-up) is only loaded on the first intent — hover, focus or click
// on the die. The button shows the die's pre-baked image (as the shop cards
// do), never a live canvas.
const FunDiceThrower = dynamic(() => import('@/components/(dices)/throw-fun'), { ssr: false });

export function DiceWidget() {
  const throwerRef = React.useRef<FunDiceHandle | null>(null);
  const pendingRolls = React.useRef(0);
  const [intent, setIntent] = React.useState(false);

  // Rolls clicked while the thrower chunk is still loading fire as soon as
  // it mounts (it then queues them itself during its shader warm-up).
  const setThrower = React.useCallback((handle: FunDiceHandle | null) => {
    throwerRef.current = handle;
    while (handle && pendingRolls.current > 0) {
      pendingRolls.current--;
      handle.roll(undefined, 'd20');
    }
  }, []);

  const roll = () => {
    setIntent(true);
    if (throwerRef.current) throwerRef.current.roll(undefined, 'd20');
    else pendingRolls.current++;
  };

  return (
    <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2 group">
      <span
        className={cn(
          'text-[10px] text-white/40 tracking-widest uppercase pr-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none',
          aclonica.className,
        )}
      >
        Lancer un dé
      </span>
      <button
        onClick={roll}
        onPointerEnter={() => setIntent(true)}
        onFocus={() => setIntent(true)}
        aria-label="Lancer un dé 20"
        className="relative w-16 h-16 flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-110"
      >
        <div className="relative w-16 h-16 pointer-events-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
          <img
            src={STILL}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
      </button>
      {intent && <FunDiceThrower ref={setThrower} hideButton defaultDiceType="d20" />}
    </div>
  );
}
