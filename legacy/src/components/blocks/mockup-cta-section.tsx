'use client'
import { motion } from 'framer-motion'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'
import { Dices, Map, ScrollText, Users } from 'lucide-react'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

const HIGHLIGHTS = [
    { icon: Map, label: 'Cartes & tokens' },
    { icon: Dices, label: 'Dés 3D physiques' },
    { icon: ScrollText, label: 'Fiches de personnage' },
    { icon: Users, label: 'Jeu collaboratif' },
]

export function MockupCtaSection({ onStart }: { onStart: () => void }) {
    return (
        <section className="overflow-hidden py-16 md:py-24">
            <div className="mx-auto max-w-6xl px-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <motion.div
                        className="text-center lg:text-left"
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <h2 className={cn("text-4xl font-semibold lg:text-5xl gold-text-gradient", aclonica.className)}>
                            Tout ce dont vous avez besoin, dans votre navigateur
                        </h2>
                        <p className={cn("mt-6 text-lg text-white/60 max-w-xl mx-auto lg:mx-0", aclonica.className)}>
                            Cartes, tokens, dés, fiches de personnage, système de combat — une plateforme complète, sans installation.
                        </p>

                        <div className="mt-8 grid grid-cols-2 gap-3 max-w-md mx-auto lg:mx-0">
                            {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                                <div
                                    key={label}
                                    className="glass-card rounded-xl px-4 py-3 flex items-center gap-2.5"
                                >
                                    <Icon className="w-4 h-4 text-[#c9a965] shrink-0" />
                                    <span className={cn("text-sm text-white/80", aclonica.className)}>{label}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={onStart}
                            className={cn(
                                "mt-10 px-8 py-3 rounded-full bg-[#c9a965] text-black font-semibold text-lg shadow-[0_0_30px_rgba(201,169,101,0.3)] hover:shadow-[0_0_50px_rgba(201,169,101,0.5)] hover:scale-105 transition-all duration-300",
                                aclonica.className
                            )}
                        >
                            Commencer gratuitement
                        </button>
                    </motion.div>

                    <motion.div
                        className="relative"
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, amount: 0.3 }}
                        transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <div className="glass-card relative rounded-3xl p-4 md:p-6">
                            <img
                                src="/landingpage/mockup.png"
                                alt="YNER VTT sur laptop"
                                className="w-full h-auto rounded-xl"
                            />
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    )
}
