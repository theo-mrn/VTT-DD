'use client'
import React from 'react'
import { FunDiceThrower, FunDiceHandle } from "@/components/(dices)/throw-fun"
import { DicePreviewCard } from "@/components/(dices)/dice-preview"
import { cn } from '@/lib/utils'
import { Aclonica } from "next/font/google"

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function DiceWidget() {
    const throwerRef = React.useRef<FunDiceHandle>(null)

    return (
        <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2 group">
            <span className={cn(
                "text-[10px] text-white/40 tracking-widest uppercase pr-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none",
                aclonica.className
            )}>
                Lancer un dé
            </span>
            <button
                onClick={() => throwerRef.current?.roll(undefined, 'd20')}
                aria-label="Lancer un dé 20"
                className="relative w-16 h-16 flex items-center justify-center cursor-pointer transition-transform duration-300 hover:scale-110"
            >
                <div className="relative w-16 h-16 pointer-events-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                    <DicePreviewCard skinId="marbre_blanc" type="d20" />
                </div>
            </button>
            <FunDiceThrower ref={throwerRef} hideButton defaultDiceType="d20" />
        </div>
    )
}
