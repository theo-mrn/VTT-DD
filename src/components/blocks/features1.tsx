'use client'
import React from 'react'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'
import { mapImagePath } from '@/utils/imagePathMapper'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function Features1() {
    const [portraitUrl, setPortraitUrl] = React.useState('')

    React.useEffect(() => {
        mapImagePath('/Photos/Elfe/Elfe34.webp').then(setPortraitUrl)
    }, [])

    return (
        <section className="overflow-hidden py-16 md:py-24">
            <div className="mx-auto max-w-6xl px-6 space-y-20">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className={cn("text-4xl font-semibold lg:text-5xl gold-text-gradient", aclonica.className)}>
                        Créez vos propres personnages
                    </h2>
                    <p className={cn("mt-6 text-lg text-white/60", aclonica.className)}>
                        Un système de création complet en 7 étapes : informations, espèce, profil, compétences, caractéristiques, inventaire et portrait.
                    </p>
                </div>

                {/* Screenshot + portrait composé style exemple.png */}
                <div className="relative max-w-3xl mt-16">
                    {/* Portrait en arrière-plan */}
                    {portraitUrl && (
                        <div className="absolute -top-40 -left-10 w-48 h-64 md:w-56 md:h-72 rounded-2xl overflow-hidden border border-[#c9a965]/15 shadow-2xl opacity-80 -rotate-6 z-0">
                            <img src={portraitUrl} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0e]/60 to-transparent" />
                        </div>
                    )}
                    {/* Screenshot principal */}
                    <div className="relative z-10 rounded-3xl overflow-hidden border border-[#c9a965]/10 gold-glow mt-32">
                        <img
                            src="/landingpage/creation.png"
                            alt="Système de création de personnage"
                            className="w-full h-auto"
                        />
                    </div>
                </div>
            </div>
        </section>
    )
}
