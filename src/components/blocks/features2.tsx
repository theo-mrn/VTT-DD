import { Map, Paintbrush, Grid3X3, Eye } from 'lucide-react'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'
import { ImageGallery } from '@/components/ui/image-gallery'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function Features2() {
    return (
        <section className="overflow-hidden py-16 md:py-32">
            <div className="mx-auto max-w-5xl space-y-8 px-6 md:space-y-12">
                <div className="relative z-10 max-w-2xl">
                    <h2 className={cn("text-4xl font-semibold lg:text-5xl", aclonica.className)}>Table de jeu interactive</h2>
                    <p className={cn("mt-6 text-lg", aclonica.className)}>Explorez des cartes dynamiques avec plus de 74 environnements disponibles. Système de grille, brouillard de guerre et outils collaboratifs intégrés.</p>
                </div>
                <div className="relative rounded-3xl overflow-hidden">
                    <ImageGallery />
                </div>
                <div className="relative mx-auto grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-8 lg:grid-cols-4">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Map className="size-4" />
                            <h3 className={cn("text-sm font-medium", aclonica.className)}>74+ Cartes</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Forêts, villages, fermes et environnements variés.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Grid3X3 className="size-4" />
                            <h3 className={cn("text-sm font-medium", aclonica.className)}>Système de Grille</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Grille configurable et brouillard de guerre par quadrillage.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Paintbrush className="size-4" />
                            <h3 className={cn("text-sm font-medium", aclonica.className)}>Outils de Dessin</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Dessinez librement et ajoutez des notes collaboratives.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Eye className="size-4" />
                            <h3 className={cn("text-sm font-medium", aclonica.className)}>Drag & Drop</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">Déplacez vos personnages en temps réel avec rayons de vision.</p>
                    </div>
                </div>
            </div>
        </section>
    )
}
