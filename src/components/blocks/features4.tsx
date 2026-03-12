'use client'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function Features4() {
    return (
        <section className="overflow-hidden py-16 md:py-24">
            <div className="mx-auto max-w-6xl px-6 space-y-10">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className={cn("text-4xl font-semibold lg:text-5xl gold-text-gradient", aclonica.className)}>
                        Vision dynamique et ombres
                    </h2>
                    <p className={cn("mt-6 text-lg text-white/60", aclonica.className)}>
                        Un système de vision réaliste avec calcul d&apos;ombres en temps réel. Chaque joueur ne voit que ce que son personnage perçoit.
                    </p>
                </div>

                <div className="relative rounded-3xl overflow-hidden border border-[#c9a965]/10 gold-glow max-w-3xl mx-auto">
                    <img
                        src="/landingpage/ombres.gif"
                        alt="Système de vision dynamique et ombres"
                        className="w-full h-auto"
                    />
                </div>
            </div>
        </section>
    )
}
