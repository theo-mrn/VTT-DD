import { User, Dices, Users, Settings } from 'lucide-react'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'
import { ImageAutoSlider } from '@/components/ui/image-auto-slider'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function Features1() {
    return (
        <section className="overflow-hidden py-16 md:py-32">
            <div className="mx-auto max-w-5xl space-y-8 px-6 md:space-y-12">
                <div className="relative z-10 max-w-2xl">
                    <h2 className={cn("text-4xl font-semibold lg:text-5xl", aclonica.className)}>Création de personnages immersive</h2>
                    <p className={cn("mt-6 text-lg", aclonica.className)}>Créez des héros uniques avec notre système complet de création en 5 étapes. Plus de 300 portraits disponibles et un système de compétences avancé.</p>
                </div>
                <div className="relative rounded-3xl overflow-hidden">
                    <div className="flex items-center justify-center p-4 min-h-[300px]">
                        <ImageAutoSlider />
                    </div>
                </div>
                <div className="relative mx-auto grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-8 lg:grid-cols-4">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <User className="size-4" />
                            <h3 className={cn("text-sm font-medium", aclonica.className)}>7 Races</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Humains, Elfes, Nains, Orcs, Drakonides et plus encore.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Dices className="size-4" />
                            <h3 className={cn("text-sm font-medium", aclonica.className)}>Stats Dynamiques</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Génération automatique des caractéristiques avec lancers de dés.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Users className="size-4" />
                            <h3 className={cn("text-sm font-medium", aclonica.className)}>300+ Portraits</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Vaste galerie de portraits ou importez vos propres images.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Settings className="size-4" />
                            <h3 className={cn("text-sm font-medium", aclonica.className)}>Compétences Avancées</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Système de voies personnalisables avec progression détaillée.</p>
                    </div>
                </div>
            </div>
        </section>
    )
}
