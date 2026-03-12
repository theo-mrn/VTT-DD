'use client'
import { FunDiceThrower } from "@/components/(dices)/throw-fun"
import { DicePreviewCard } from "@/components/(dices)/dice-preview"
import { cn } from '@/lib/utils'
import { Aclonica } from "next/font/google"
import { motion } from 'framer-motion'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function DiceSection() {
    return (
        <motion.section
            className="w-full py-20 px-6 relative overflow-hidden"
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-96 h-96 bg-[#c9a965] rounded-full blur-[120px] opacity-[0.04]" />
            </div>

            <div className="max-w-6xl mx-auto relative z-10 flex flex-col md:flex-row items-center gap-12">

                <div className="relative w-44 h-44 md:w-52 md:h-52 shrink-0 group">
                    <div className="absolute inset-0 rounded-full bg-[#c9a965]/5 blur-2xl group-hover:bg-[#c9a965]/12 transition-all duration-300" />
                    <DicePreviewCard skinId="bleu_marble" type="d20" />

                    <div className="absolute inset-0 z-10 flex items-center justify-center [&_button]:!absolute [&_button]:!inset-0 [&_button]:!w-full [&_button]:!h-full [&_button]:!opacity-0 [&_button]:!cursor-pointer [&_button]:!p-0 [&_button]:!m-0 [&_button]:!border-0 [&_button]:!bg-transparent">
                        <FunDiceThrower buttonText="" defaultDiceType="d20" className="w-full h-full" />
                    </div>
                    <div className={cn(
                        "absolute -bottom-6 left-0 w-full text-center text-[10px] text-white/25 group-hover:text-[#c9a965]/50 transition-colors tracking-widest uppercase pointer-events-none",
                        aclonica.className
                    )}>
                        Cliquez pour lancer
                    </div>
                </div>


                <div className="flex-1 space-y-4 text-center md:text-left">
                    <h2 className={cn("text-4xl md:text-5xl font-bold gold-text-gradient", aclonica.className)}>
                        Lancer les Dés 3D
                    </h2>
                    <p className={cn("text-lg text-white/60 max-w-xl", aclonica.className)}>
                        Un moteur physique réaliste et des effets visuels époustouflants directement dans votre navigateur.
                    </p>
                </div>
            </div>
        </motion.section>
    )
}
