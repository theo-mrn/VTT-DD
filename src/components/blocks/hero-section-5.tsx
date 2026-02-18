'use client'
import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Menu, X, ChevronRight } from 'lucide-react'
import { useScroll, motion } from 'framer-motion'
import { Aclonica } from "next/font/google"
import Login06 from '@/components/ui/login-3'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import { Features1 } from '@/components/blocks/features1'
import { Features2 } from '@/components/blocks/features2'
import { Features3 } from '@/components/blocks/features3'

import { ShaderBackground, PulsingCircle } from '@/components/ui/shaders-hero-section'

import InfiniteHero from "@/components/ui/infinite-hero";



const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

const HeroHeader = ({ onOpenAuth }: { onOpenAuth: () => void }) => {
    const [menuState, setMenuState] = React.useState(false)
    const [scrolled, setScrolled] = React.useState(false)
    const { scrollYProgress } = useScroll()

    React.useEffect(() => {
        const unsubscribe = scrollYProgress.on('change', (latest) => {
            setScrolled(latest > 0.05)
        })
        return () => unsubscribe()
    }, [scrollYProgress])

    return (
        <header>
            <nav
                data-state={menuState && 'active'}
                className="group fixed z-20 w-full pt-8">
                <div className={cn('mx-auto max-w-7xl rounded-3xl px-6 transition-all duration-300 lg:px-12', scrolled ? 'bg-background/50 backdrop-blur-2xl' : '')}>
                    <motion.div
                        key={1}
                        className={cn('relative flex flex-wrap items-center justify-between gap-6 py-3 duration-200 lg:gap-0 lg:py-6', scrolled ? 'lg:py-4' : '')}>
                        <div className="flex w-full items-center justify-between gap-12 lg:w-auto">
                            <Link
                                href="/"
                                aria-label="home"
                                className="flex items-center space-x-2">
                                <Logo />
                            </Link>

                            <button
                                onClick={() => setMenuState(!menuState)}
                                aria-label={menuState == true ? 'Close Menu' : 'Open Menu'}
                                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden">
                                <Menu className="group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                            </button>
                        </div>

                        <div className="bg-background group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                                <Button
                                    onClick={onOpenAuth}
                                    size="sm"
                                    className={aclonica.className}>
                                    <span>S&apos;identifier</span>
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </nav>
        </header>
    )
}

const Logo = () => {
    return (
        <div>
            <h1 className={aclonica.className}>YNER</h1>
        </div>
    )
}

export function HeroSection() {
    const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false)
    const [isUserLoggedIn, setIsUserLoggedIn] = React.useState<boolean | null>(null)

    const router = useRouter()

    React.useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setIsUserLoggedIn(!!user)
        })
        return () => unsubscribe()
    }, [])



    const handleStartAdventure = () => {
        if (isUserLoggedIn) {
            router.push('/Salle')
        } else {
            setIsAuthModalOpen(true)
        }
    }

    return (
        <>
            <HeroHeader onOpenAuth={() => setIsAuthModalOpen(true)} />
            <main className="overflow-x-hidden">
                <section>
                    <div className="py-24 md:pb-32 lg:pb-36 lg:pt-72">
                        <div className="relative z-10 mx-auto flex max-w-7xl flex-col px-6 lg:block lg:px-12">
                            <div className="mx-auto max-w-lg text-center lg:ml-0 lg:max-w-full lg:text-left">
                                <h1 className={cn("mt-8 max-w-2xl text-balance text-5xl md:text-6xl lg:mt-16 xl:text-7xl", aclonica.className)}>Votre table virtuelle ultime</h1>
                                <p className={cn("mt-8 max-w-2xl text-balance text-lg", aclonica.className)}>Créez des aventures épiques avec votre groupe. Plateforme VTT simple et intuitive.</p>

                                <div className="mt-12 flex flex-col items-center justify-center gap-2 sm:flex-row lg:justify-start">
                                    <Button
                                        onClick={handleStartAdventure}
                                        disabled={isUserLoggedIn === null}
                                        size="lg"
                                        className={cn("h-12 rounded-full pl-5 pr-3 text-base", aclonica.className)}>
                                        <span className="text-nowrap">
                                            {isUserLoggedIn === null ? 'Chargement...' : "Commencer l'aventure"}
                                        </span>
                                        <ChevronRight className="ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div className="aspect-[2/3] absolute inset-5 overflow-hidden rounded-3xl border border-black/10 sm:aspect-video lg:rounded-[3rem] dark:border-white/5">
                            <ShaderBackground className="size-full">
                            </ShaderBackground>
                        </div>
                    </div>
                </section>

                {/* <InfiniteHero /> */}

                <section>
                    <div className="lg:pt-64 lg:pb-16">
                        <div className="aspect-[2/3] relative mx-5 overflow-hidden rounded-3xl border border-black/10 sm:aspect-video lg:rounded-[3rem] dark:border-white/5">
                            <div className="size-full bg-background/95 backdrop-blur-xl">
                                <Features1 />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Troisième carte avec le composant Features */}
                <section>
                    <div className="lg:pb-16">
                        <div className="aspect-[2/3] relative mx-5 overflow-hidden rounded-3xl border border-black/10 sm:aspect-video lg:rounded-[3rem] dark:border-white/5">
                            <div className="size-full bg-background/95 backdrop-blur-xl">
                                <Features2 />
                            </div>
                        </div>
                    </div>
                </section>

                <section>
                    <div className="lg:pb-16">
                        <div className="aspect-[2/3] relative mx-5 overflow-hidden rounded-3xl border border-black/10 sm:aspect-video lg:rounded-[3rem] dark:border-white/5">
                            <div className="size-full bg-background/95 backdrop-blur-xl">
                                <Features3 />
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Modal d'authentification */}
            {isAuthModalOpen && (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsAuthModalOpen(false)}
                    />
                    <div className="relative z-10 flex items-center justify-center min-h-screen p-4">
                        <div className="relative">
                            <button
                                onClick={() => setIsAuthModalOpen(false)}
                                className="absolute -top-4 -right-4 z-20 bg-zinc-900 rounded-xl p-2 shadow-lg hover:bg-zinc-800 text-white"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <Login06 />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}