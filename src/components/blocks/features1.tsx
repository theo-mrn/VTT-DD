'use client'
import React from 'react'
import { motion } from 'framer-motion'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'
import { mapImagePath } from '@/utils/imagePathMapper'
import { UserCircle2, ScrollText, Eye, Swords, CloudRain, NotebookPen, Backpack, Layers, MessageCircle } from 'lucide-react'
import { AmbiancePlayerCard } from '@/components/blocks/ambiance-widget'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

interface BentoCardProps {
    icon: React.ReactNode
    title: string
    description: string
    image: string
    imageAlt: string
    span: string
    imageClassName?: string
    imageFit?: 'cover' | 'contain'
    delay: number
}

function BentoCard({ icon, title, description, image, imageAlt, span, imageClassName, imageFit = 'cover', compact, delay }: BentoCardProps & { compact?: boolean }) {
    return (
        <motion.div
            className={cn(
                "glass-card glass-card-hover relative rounded-3xl flex flex-col overflow-hidden",
                compact ? "p-5 md:p-6" : "p-6 md:p-8",
                span
            )}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                    "flex items-center justify-center rounded-xl bg-[#c9a965]/10 text-[#c9a965] shrink-0",
                    compact ? "w-9 h-9" : "w-10 h-10"
                )}>
                    {icon}
                </div>
                <h3 className={cn(compact ? "text-lg font-semibold text-white" : "text-xl md:text-2xl font-semibold text-white", aclonica.className)}>
                    {title}
                </h3>
            </div>
            <p className={cn(compact ? "text-white/60 text-sm leading-relaxed" : "text-white/60 text-sm md:text-base leading-relaxed max-w-md", aclonica.className)}>
                {description}
            </p>
            <div className={cn(
                "relative mt-4 flex-1 rounded-2xl overflow-hidden border border-white/10",
                compact ? "min-h-[140px]" : "min-h-[180px]",
                imageFit === 'contain' && "bg-black/30 flex items-center justify-center"
            )}>
                <img
                    src={image}
                    alt={imageAlt}
                    className={cn(
                        "w-full h-full",
                        imageFit === 'cover' ? "object-cover" : "object-contain p-6",
                        imageClassName
                    )}
                    loading="lazy"
                />
                {imageFit === 'cover' && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
                )}
            </div>
        </motion.div>
    )
}

interface BentoVideoCardProps {
    icon: React.ReactNode
    title: string
    description: string
    src: string
    span: string
    compact?: boolean
    delay: number
}

function BentoVideoCard({ icon, title, description, src, span, compact, delay }: BentoVideoCardProps) {
    return (
        <motion.div
            className={cn(
                "glass-card glass-card-hover relative rounded-3xl flex flex-col overflow-hidden",
                compact ? "p-5 md:p-6" : "p-6 md:p-8",
                span
            )}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                    "flex items-center justify-center rounded-xl bg-[#c9a965]/10 text-[#c9a965] shrink-0",
                    compact ? "w-9 h-9" : "w-10 h-10"
                )}>
                    {icon}
                </div>
                <h3 className={cn(compact ? "text-lg font-semibold text-white" : "text-xl md:text-2xl font-semibold text-white", aclonica.className)}>
                    {title}
                </h3>
            </div>
            <p className={cn(compact ? "text-white/60 text-sm leading-relaxed" : "text-white/60 text-sm md:text-base leading-relaxed max-w-md", aclonica.className)}>
                {description}
            </p>
            <div className={cn(
                "relative mt-4 flex-1 rounded-2xl overflow-hidden border border-white/10",
                compact ? "min-h-[140px]" : "min-h-[180px]"
            )}>
                <video
                    src={src}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
            </div>
        </motion.div>
    )
}

interface MiniFeatureCardProps {
    icon: React.ReactNode
    title: string
    description: string
    delay: number
}

function MiniFeatureCard({ icon, title, description, delay }: MiniFeatureCardProps) {
    return (
        <motion.div
            className="glass-card glass-card-hover relative rounded-2xl p-6 flex flex-col"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#c9a965]/10 text-[#c9a965] shrink-0 mb-3">
                {icon}
            </div>
            <h3 className={cn("text-lg font-semibold text-white", aclonica.className)}>
                {title}
            </h3>
            <p className={cn("mt-2 text-white/60 text-sm leading-relaxed", aclonica.className)}>
                {description}
            </p>
        </motion.div>
    )
}

const MINI_FEATURES = [
    {
        icon: <Swords className="w-5 h-5" />,
        title: 'Combat tactique',
        description: "Résolvez attaques, dégâts et compétences directement sur la table, avec un suivi partagé en temps réel.",
    },
    {
        icon: <MessageCircle className="w-5 h-5" />,
        title: 'Chat de groupe',
        description: "Discutez en texte ou en image, en public à toute la table ou en message privé à un joueur.",
    },
    {
        icon: <NotebookPen className="w-5 h-5" />,
        title: 'Éditeur de scénario',
        description: "Préparez vos parties avec un carnet de MJ enrichi, mentions de personnages et de scènes incluses.",
    },
    {
        icon: <Backpack className="w-5 h-5" />,
        title: 'Inventaire complet',
        description: "Objets, armes et monnaie de chaque personnage, avec bonus d'équipement et visibilité privée ou publique.",
    },
    {
        icon: <Layers className="w-5 h-5" />,
        title: 'Multi-système',
        description: "Pas figé sur un seul système de jeu : Yner s'adapte à vos règles",
    },
]

export function Features1() {
    const [assets, setAssets] = React.useState<Record<string, string>>({})

    React.useEffect(() => {
        Promise.all([
            mapImagePath('/landingpage/creation.png'),
            mapImagePath('/landingpage/fiche.png'),
            mapImagePath('/landingpage/ombres.gif'),
            mapImagePath('/landingpage/weather.mp4'),
        ]).then(([creation, fiche, ombres, weather]) => {
            setAssets({ creation, fiche, ombres, weather })
        })
    }, [])

    return (
        <section className="overflow-hidden py-16 md:py-24 bg-[#0c0c0e]">
            <div className="mx-auto max-w-6xl px-6">
                <div className="max-w-2xl mx-auto text-center mb-14">
                    <span className={cn("text-xs md:text-sm tracking-[0.3em] uppercase text-[#c9a965]/70", aclonica.className)}>
                        Fonctionnalités
                    </span>
                    <h2 className={cn("mt-3 text-4xl font-semibold lg:text-5xl gold-text-gradient", aclonica.className)}>
                        Tout pour vos parties, au même endroit
                    </h2>
                    <p className={cn("mt-6 text-lg text-white/60", aclonica.className)}>
                        Création de personnage, table de jeu, fiches et éclairage dynamique — une plateforme complète pensée pour les rôlistes.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {assets.creation && (
                        <BentoCard
                            icon={<UserCircle2 className="w-5 h-5" />}
                            title="Créez vos personnages"
                            description="Un système de création complet en 7 étapes : informations, espèce, profil, compétences, caractéristiques, inventaire et portrait."
                            image={assets.creation}
                            imageAlt="Système de création de personnage"
                            span="md:col-span-3"
                            imageFit="contain"
                            delay={0}
                        />
                    )}
                    {assets.fiche && (
                        <BentoCard
                            icon={<ScrollText className="w-5 h-5" />}
                            title="Fiches personnalisables"
                            description="Stats, compétences, inventaire, effets actifs — tout est accessible d'un coup d'œil."
                            image={assets.fiche}
                            imageAlt="Fiche de personnage personnalisable"
                            span="md:col-span-1"
                            imageClassName="object-top"
                            compact
                            delay={0.2}
                        />
                    )}
                    {assets.ombres && (
                        <BentoCard
                            icon={<Eye className="w-5 h-5" />}
                            title="Vision et ombres dynamiques"
                            description="Calcul d'ombres en temps réel : chaque joueur ne voit que ce que son personnage perçoit."
                            image={assets.ombres}
                            imageAlt="Système de vision dynamique et ombres"
                            span="md:col-span-1"
                            compact
                            delay={0.3}
                        />
                    )}
                    {assets.weather && (
                        <BentoVideoCard
                            icon={<CloudRain className="w-5 h-5" />}
                            title="Météo dynamique"
                            description="Pluie, neige, brouillard ou tempête : habillez vos cartes en un clic pour planter le décor."
                            src={assets.weather}
                            span="md:col-span-1"
                            compact
                            delay={0.4}
                        />
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
                    <MiniFeatureCard
                        icon={MINI_FEATURES[0].icon}
                        title={MINI_FEATURES[0].title}
                        description={MINI_FEATURES[0].description}
                        delay={0}
                    />
                    <AmbiancePlayerCard delay={0.1} />
                    {MINI_FEATURES.slice(1).map((f, i) => (
                        <MiniFeatureCard
                            key={f.title}
                            icon={f.icon}
                            title={f.title}
                            description={f.description}
                            delay={0.1 * (i + 2)}
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}
