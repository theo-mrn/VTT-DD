'use client'
import React from 'react'
import { motion } from 'framer-motion'
import { mapImagePath } from '@/utils/imagePathMapper'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Aclonica } from 'next/font/google'
import { ChevronRight } from 'lucide-react'

const aclonica = Aclonica({ weight: '400', subsets: ['latin'] })

export function StartCampaignSection({ onStart }: { onStart: () => void }) {
    const [bgImage, setBgImage] = React.useState('')

    React.useEffect(() => {
        mapImagePath('/Cartes/Foret/image2.webp').then(setBgImage)
    }, [])

    return (
        <section className="relative min-h-[60vh] flex items-center justify-center overflow-hidden">
            {bgImage && (
                <img
                    src={bgImage}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0e] via-[#0c0c0e]/80 to-[#0c0c0e]/60" />

            <motion.div
                className="relative z-10 text-center px-6 max-w-3xl"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
                <h2 className={cn(
                    "text-4xl md:text-5xl lg:text-6xl mb-6s gold-text-gradient",
                    aclonica.className
                )}>
                    Commencez votre campagne
                </h2>
                <p className={cn(
                    "text-lg text-white/70 mb-10 max-w-xl mx-auto",
                    aclonica.className
                )}>
                    Rassemblez vos joueurs et plongez dans l&apos;aventure.
                </p>
                <Button
                    onClick={onStart}
                    size="lg"
                    className={cn(
                        "h-14 px-10 rounded-full text-lg",
                        "bg-[#c9a965] text-[#0c0c0e] hover:bg-[#f7d96d]",
                        "shadow-[0_0_40px_rgba(201,169,101,0.3)] hover:shadow-[0_0_60px_rgba(201,169,101,0.4)]",
                        "transition-all duration-300",
                        aclonica.className
                    )}
                >
                    <span>Commencer une campagne</span>
                    <ChevronRight className="ml-1" />
                </Button>
            </motion.div>
        </section>
    )
}
