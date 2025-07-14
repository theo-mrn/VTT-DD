import { User, Dices, Users, Settings } from 'lucide-react'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'

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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center max-w-4xl w-full">
                            <div className="flex justify-center">
                                <div className="relative">
                                    <img 
                                        src="/Photos/Nain/Nain235.webp" 
                                        className="w-48 h-48 md:w-56 md:h-56 object-cover rounded-2xl shadow-xl border-2 border-gray-200 dark:border-gray-700" 
                                        alt="Portrait de Nain - Guerrier" 
                                    />
                                    <div className={cn("absolute -bottom-2 -right-2 text-white text-xs px-2 py-1 rounded-full font-medium", aclonica.className)} style={{backgroundColor: '#C0A080'}}>
                                        Nain
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-center">
                                <div className="relative">
                                    <img 
                                        src="/Photos/Elfe/Elfe34.webp" 
                                        className="w-48 h-48 md:w-56 md:h-56 object-cover rounded-2xl shadow-xl border-2 border-gray-200 dark:border-gray-700" 
                                        alt="Portrait d'Elfe - Archer" 
                                    />
                                    <div className={cn("absolute -bottom-2 -right-2 text-white text-xs px-2 py-1 rounded-full font-medium", aclonica.className)} style={{backgroundColor: '#C0A080'}}>
                                        Elfe
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-center">
                                <div className="relative">
                                    <img 
                                        src="/Photos/Humain/Humain1.webp" 
                                        className="w-48 h-48 md:w-56 md:h-56 object-cover rounded-2xl shadow-xl border-2 border-gray-200 dark:border-gray-700" 
                                        alt="Portrait d'Humain - Mage" 
                                    />
                                    <div className={cn("absolute -bottom-2 -right-2 text-white text-xs px-2 py-1 rounded-full font-medium", aclonica.className)} style={{backgroundColor: '#C0A080'}}>
                                        Humain
                                    </div>
                                </div>
                            </div>
                        </div>
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
