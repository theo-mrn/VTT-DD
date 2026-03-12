'use client'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'
import { ImageGallery } from '@/components/ui/image-gallery'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function Features2() {
    return (
        <section className="overflow-hidden py-16 md:py-24">
            <div className="mx-auto max-w-6xl px-6 space-y-10">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className={cn("text-4xl font-semibold lg:text-5xl gold-text-gradient", aclonica.className)}>
                        Table de jeu interactive
                    </h2>
                    <p className={cn("mt-6 text-lg text-white/60", aclonica.className)}>
                        Explorez des cartes dynamiques avec plus de 74 environnements disponibles. Système de grille, brouillard de guerre et outils collaboratifs intégrés.
                    </p>
                </div>

                <div className="relative rounded-3xl overflow-hidden border border-[#c9a965]/10 gold-glow">
                    <ImageGallery />
                </div>
            </div>
        </section>
    )
}
