import { Swords, Dices, Users2, Zap } from 'lucide-react'
import { Aclonica } from "next/font/google"
import { cn } from '@/lib/utils'

const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

export function Features3() {
    return (
        <section className="overflow-hidden py-16 md:py-32">
            <div className="mx-auto max-w-5xl space-y-8 px-6 md:space-y-12">
                <div className="relative z-10 max-w-2xl mx-auto text-center">
                    <h2 className={cn("text-4xl font-semibold lg:text-5xl", aclonica.className)}>
                        Combat et outils immersifs
                    </h2>
                    <p className={cn("mt-6 text-lg text-muted-foreground", aclonica.className)}>
                        Système de combat intégré avec gestion automatique de l&apos;initiative, 70+ tokens de créatures et lanceur de dés pour une expérience complète.
                    </p>
                </div>
                
                <div className="relative mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
                    <div className="group relative">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-muted-foreground/20 via-muted-foreground/40 to-muted-foreground/20 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm"></div>
                        
                        <div className="relative p-8 rounded-2xl bg-card border border-border hover:border-muted-foreground/30 transition-all duration-300 hover:shadow-lg h-full min-h-[200px] flex flex-col">
                            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted/50 mb-4 group-hover:scale-110 transition-transform duration-300">
                                <Swords className="size-6 text-foreground" />
                            </div>
                            
                            <h3 className={cn("text-lg font-semibold mb-2", aclonica.className)}>
                                Combat Tour par Tour
                            </h3>
                            <p className="text-muted-foreground text-sm flex-1">
                                Gestion automatique de l&apos;initiative et des points de vie pour des combats fluides.
                            </p>
                        </div>
                    </div>

                    <div className="group relative">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-muted-foreground/20 via-muted-foreground/40 to-muted-foreground/20 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm"></div>
                        
                        <div className="relative p-8 rounded-2xl bg-card border border-border hover:border-muted-foreground/30 transition-all duration-300 hover:shadow-lg h-full min-h-[200px] flex flex-col">
                            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted/50 mb-4 group-hover:scale-110 transition-transform duration-300">
                                <Dices className="size-6 text-foreground" />
                            </div>
                            
                            <h3 className={cn("text-lg font-semibold mb-2", aclonica.className)}>
                                Lanceur de Dés
                            </h3>
                            <p className="text-muted-foreground text-sm flex-1">
                                Animations visuelles et support multi-dés intégré avec historique complet.
                            </p>
                        </div>
                    </div>

                    <div className="group relative">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-muted-foreground/20 via-muted-foreground/40 to-muted-foreground/20 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm"></div>
                        
                        <div className="relative p-8 rounded-2xl bg-card border border-border hover:border-muted-foreground/30 transition-all duration-300 hover:shadow-lg h-full min-h-[200px] flex flex-col">
                            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted/50 mb-4 group-hover:scale-110 transition-transform duration-300">
                                <Users2 className="size-6 text-foreground" />
                            </div>
                            
                            <h3 className={cn("text-lg font-semibold mb-2", aclonica.className)}>
                                70+ Tokens
                            </h3>
                            <p className="text-muted-foreground text-sm flex-1">
                                Large collection de tokens de créatures et PNJ pour enrichir vos parties.
                            </p>
                        </div>
                    </div>

                    <div className="group relative">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-muted-foreground/20 via-muted-foreground/40 to-muted-foreground/20 rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur-sm"></div>
                        
                        <div className="relative p-8 rounded-2xl bg-card border border-border hover:border-muted-foreground/30 transition-all duration-300 hover:shadow-lg h-full min-h-[200px] flex flex-col">
                            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-muted/50 mb-4 group-hover:scale-110 transition-transform duration-300">
                                <Zap className="size-6 text-foreground" />
                            </div>
                            
                            <h3 className={cn("text-lg font-semibold mb-2", aclonica.className)}>
                                Temps Réel
                            </h3>
                            <p className="text-muted-foreground text-sm flex-1">
                                Synchronisation instantanée entre tous les joueurs avec salles privées/publiques.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}