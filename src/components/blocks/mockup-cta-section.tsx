'use client'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function MockupCtaSection({ onStart }: { onStart: () => void }) {
    return (
        <section className="overflow-hidden py-16 md:py-24">
            <div className="mx-auto max-w-5xl px-6 space-y-10 text-center">
                <h2 className={cn("text-4xl font-semibold lg:text-5xl gold-text-gradient", aclonica.className)}>
                    Tout ce dont vous avez besoin, dans votre navigateur
                </h2>
                <p className={cn("text-lg text-white/60 max-w-2xl mx-auto", aclonica.className)}>
                    Cartes, tokens, dés, fiches de personnage, système de combat — une plateforme complète, sans installation.
                </p>

                <div className="relative max-w-3xl mx-auto">
                    <img
                        src="/landingpage/mockup.png"
                        alt="YNER VTT sur laptop"
                        className="w-full h-auto"
                    />
                </div>

                <button
                    onClick={onStart}
                    className={cn(
                        "px-8 py-3 rounded-full bg-[#c9a965] text-black font-semibold text-lg shadow-[0_0_30px_rgba(201,169,101,0.3)] hover:shadow-[0_0_50px_rgba(201,169,101,0.5)] hover:scale-105 transition-all duration-300",
                        aclonica.className
                    )}
                >
                    Commencer gratuitement
                </button>
            </div>
        </section>
    )
}
