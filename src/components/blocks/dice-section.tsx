import { FunDiceThrower } from "@/components/(dices)/throw-fun"
import Image from "next/image"

export function DiceSection() {
    return (
        <section className="w-full py-20 px-4 md:px-8 bg-[var(--bg-panel)] border-t border-b border-[var(--border-primary)] relative overflow-hidden">
            {/* Background decorative elements */}
            <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center">
                <div className="w-96 h-96 bg-[var(--accent-brown)] rounded-full blur-3xl mix-blend-screen" />
            </div>

            <div className="max-w-6xl mx-auto relative z-10 flex flex-col md:flex-row items-center gap-12">
                
                {/* Text Content */}
                <div className="flex-1 space-y-6 text-center md:text-left">
                    <h2 className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] font-heading">
                        Lancer les Dés 3D
                    </h2>
                    <p className="text-lg text-[var(--text-secondary)] max-w-xl">
                        Expérimentez la sensation authentique du lancer de dés directement dans votre navigateur. 
                        Un moteur physique réaliste, des effets visuels époustouflants et une multitude de skins aléatoires 
                        pour chaque lancer !
                    </p>
                    
                    <div className="pt-4 flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
                        <FunDiceThrower 
                            buttonText="Lancer un D20" 
                            defaultDiceType="d20" 
                            className=""
                        />
                    </div>
                </div>

                {/* Visual Representation */}
                <div className="flex-1 relative w-full aspect-square max-w-sm rounded-3xl border-2 border-[var(--border-primary)] bg-[var(--bg-canvas)] shadow-2xl overflow-hidden flex items-center justify-center group mx-auto">
                    <div className="absolute inset-0 bg-gradient-to-tr from-[var(--bg-panel)] to-transparent opacity-50 pointer-events-none" />
                    
                    {/* Pulsing ring effect */}
                    <div className="absolute w-56 h-56 border border-[var(--accent-brown)] rounded-full opacity-20 group-hover:animate-ping pointer-events-none" />
                    
                    {/* Static 3D Dice Image representation */}
                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center transition-transform duration-500 group-hover:scale-105">
                       <div className="text-9xl drop-shadow-[0_0_25px_rgba(200,150,50,0.6)] animate-pulse">
                           🎲
                       </div>
                    </div>
                    
                    <div className="absolute bottom-6 left-0 w-full text-center text-sm text-[var(--text-secondary)] opacity-60 font-medium tracking-wide uppercase">
                        Lancez les dés ci-contre
                    </div>
                </div>

            </div>
        </section>
    )
}
