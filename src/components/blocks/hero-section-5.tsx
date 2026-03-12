'use client'
import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Menu, X, ChevronRight, Mail, ChevronDown, Send } from 'lucide-react'
import { useScroll, motion, useTransform } from 'framer-motion'
import { Aclonica } from "next/font/google"
import Login06 from '@/components/ui/login-3'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { auth, db, doc, getDoc, addDoc, collection, serverTimestamp } from '../../lib/firebase'
import { useGame } from '@/contexts/GameContext'
import { Features1 } from '@/components/blocks/features1'
import { Features2 } from '@/components/blocks/features2'
import { Features3 } from '@/components/blocks/features3'
import { Features4 } from '@/components/blocks/features4'
import { MockupCtaSection } from '@/components/blocks/mockup-cta-section'
import { StartCampaignSection } from '@/components/blocks/start-campaign-section'
import { DiceSection } from '@/components/blocks/dice-section'
import { TestimonialsSection } from '@/components/ui/testimonial-v2'
import { ShaderBackground } from '@/components/ui/hero'
import { ImageAutoSlider } from '@/components/ui/image-auto-slider'
import { mapImagePath } from '@/utils/imagePathMapper'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { LogOut, User } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"



const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

const HERO_PORTRAITS = [
    { path: "/Photos/Nain/Nain235.webp", position: "left-[3%] top-[18%]", size: "w-32 h-44 md:w-44 md:h-60", rotation: "-rotate-6", delay: 0, hideMobile: false },
    { path: "/Photos/Elfe/Elfe34.webp", position: "right-[4%] top-[12%]", size: "w-28 h-40 md:w-40 md:h-56", rotation: "rotate-3", delay: 0.3, hideMobile: false },
    { path: "/Photos/Humain/Humain1.webp", position: "left-[12%] bottom-[18%]", size: "w-28 h-38 md:w-36 md:h-48", rotation: "rotate-6", delay: 0.6, hideMobile: true },
    { path: "/Photos/Orc/Orc1.webp", position: "right-[10%] bottom-[15%]", size: "w-28 h-38 md:w-38 md:h-52", rotation: "-rotate-3", delay: 0.9, hideMobile: true },
    { path: "/Photos/Drakonide/Drakonide1.webp", position: "left-[28%] top-[8%]", size: "w-24 h-32 md:w-32 md:h-44", rotation: "rotate-2", delay: 1.2, hideMobile: false },
]

const FloatingPortrait = ({ src, position, size, rotation, delay, index, scrollProgress, hideMobile }: {
    src: string
    position: string
    size: string
    rotation: string
    delay: number
    index: number
    scrollProgress: any
    hideMobile: boolean
}) => {
    const y = useTransform(scrollProgress, [0, 0.3], [0, -60 - index * 20])
    const opacity = useTransform(scrollProgress, [0, 0.25], [1, 0])

    return (
        <motion.div
            className={cn(
                "absolute z-0 rounded-2xl overflow-hidden border border-[#c9a965]/20 shadow-xl pointer-events-none",
                position, size, rotation,
                hideMobile && "hidden md:block"
            )}
            style={{ y, opacity, willChange: 'transform' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
                opacity: 1,
                scale: 1,
                y: [0, -12, 0],
            }}
            transition={{
                opacity: { duration: 0.8, delay: delay + 0.5 },
                scale: { duration: 0.8, delay: delay + 0.5 },
                y: { duration: 3.5 + index * 0.5, repeat: Infinity, ease: "easeInOut", delay: delay },
            }}
        >
            {src && (
                <img
                    src={src}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="eager"
                />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </motion.div>
    )
}

const HeroHeader = ({ onOpenAuth, isUserLoggedIn, userData, onOpenProfile, router }: {
    onOpenAuth: () => void,
    isUserLoggedIn: boolean | null,
    userData: any,
    onOpenProfile: () => void,
    router: any
}) => {
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
                <div className={cn('mx-auto max-w-7xl rounded-3xl px-6 transition-all duration-300 lg:px-12', scrolled ? 'bg-[#0c0c0e]/80 backdrop-blur-2xl border border-white/5' : '')}>
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

                        <div className="bg-[#0c0c0e] group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border border-white/10 p-6 shadow-2xl md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none">
                            <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit">
                                {isUserLoggedIn === null ? (
                                    <div className="w-10 h-10 rounded-full bg-zinc-200/20 animate-pulse" />
                                ) : isUserLoggedIn ? (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Avatar className="h-10 w-10 border-2 border-[#c9a965]/50 hover:border-[#c9a965] transition-all cursor-pointer shadow-md bg-white/5">
                                                <AvatarImage src={userData?.pp || ""} className="object-cover" />
                                                <AvatarFallback className="bg-[#c9a965] text-[#0c0c0e] font-bold">
                                                    {userData?.name ? userData.name.charAt(0).toUpperCase() : "?"}
                                                </AvatarFallback>
                                            </Avatar>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56 bg-[#0c0c0e] border-[#c9a965]/20 text-white">
                                            <DropdownMenuItem onClick={onOpenProfile} className="focus:bg-white/10 focus:text-white cursor-pointer gap-2">
                                                <User className="w-4 h-4" />
                                                <span>Voir mon profil</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator className="bg-white/10" />
                                            <DropdownMenuItem onClick={() => signOut(auth).then(() => router.push("/"))} className="focus:bg-red-500/20 focus:text-red-400 text-red-400 cursor-pointer gap-2">
                                                <LogOut className="w-4 h-4" />
                                                <span>Se déconnecter</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <Button
                                        onClick={onOpenAuth}
                                        size="sm"
                                        className={cn(
                                            "bg-[#c9a965] text-[#0c0c0e] hover:bg-[#f7d96d] rounded-full px-6",
                                            aclonica.className
                                        )}>
                                        <span>S&apos;identifier</span>
                                    </Button>
                                )}
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
        <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Yner Logo" className="h-12 w-auto drop-shadow-md" />
            <h1 className={cn("text-3xl tracking-wider text-white", aclonica.className)}>YNER</h1>
        </div>
    )
}

export function HeroSection() {
    const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false)
    const [isProfileOpen, setIsProfileOpen] = React.useState(false)
    const [userData, setUserData] = React.useState<any>(null)
    const [heroPortraits, setHeroPortraits] = React.useState<string[]>([])

    const { user: gameUser, isLoading } = useGame()
    const isUserLoggedIn = isLoading ? null : !!gameUser?.uid
    const router = useRouter()
    const { scrollYProgress } = useScroll()

    React.useEffect(() => {
        const uid = gameUser?.uid
        if (!uid) {
            setUserData(null)
            return
        }
        getDoc(doc(db, "users", uid)).then((docSnap) => {
            if (docSnap.exists()) {
                setUserData(docSnap.data())
            }
        })
    }, [gameUser?.uid])

    React.useEffect(() => {
        Promise.all(HERO_PORTRAITS.map(p => mapImagePath(p.path))).then(setHeroPortraits)
    }, [])

    const handleStartAdventure = () => {
        if (isUserLoggedIn) {
            router.push('/home')
        } else {
            setIsAuthModalOpen(true)
        }
    }

    return (
        <>
            <HeroHeader
                onOpenAuth={() => setIsAuthModalOpen(true)}
                isUserLoggedIn={isUserLoggedIn}
                userData={userData}
                onOpenProfile={() => setIsProfileOpen(true)}
                router={router}
            />
            <main className="overflow-x-hidden">

                <section className="relative min-h-screen flex items-center justify-center">
                    <div className="fixed inset-0 -z-10 w-full h-full pointer-events-none">
                        <ShaderBackground />
                    </div>


                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        {heroPortraits.map((src, i) => (
                            <FloatingPortrait
                                key={i}
                                src={src}
                                position={HERO_PORTRAITS[i].position}
                                size={HERO_PORTRAITS[i].size}
                                rotation={HERO_PORTRAITS[i].rotation}
                                delay={HERO_PORTRAITS[i].delay}
                                index={i}
                                scrollProgress={scrollYProgress}
                                hideMobile={HERO_PORTRAITS[i].hideMobile}
                            />
                        ))}
                    </div>


                    <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.8, delay: 0.2 }}
                        >
                            <h1 className={cn(
                                "text-5xl md:text-6xl xl:text-8xl gold-text-gradient leading-tight",
                                aclonica.className
                            )}>
                                Votre table virtuelle ultime
                            </h1>
                        </motion.div>
                        <motion.p
                            className={cn("mt-6 max-w-2xl mx-auto text-lg md:text-xl text-white/70", aclonica.className)}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.5 }}
                        >
                            Créez des aventures épiques avec votre groupe. Plateforme VTT simple et intuitive.
                        </motion.p>

                        <motion.div
                            className="mt-10 flex items-center justify-center"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.8 }}
                        >
                            <Button
                                onClick={handleStartAdventure}
                                disabled={isUserLoggedIn === null}
                                size="lg"
                                className={cn(
                                    "h-14 rounded-full pl-8 pr-5 text-lg",
                                    "bg-[#c9a965] text-[#0c0c0e] hover:bg-[#f7d96d]",
                                    "shadow-[0_0_40px_rgba(201,169,101,0.3)] hover:shadow-[0_0_60px_rgba(201,169,101,0.4)]",
                                    "transition-all duration-300",
                                    aclonica.className
                                )}>
                                <span className="text-nowrap">
                                    {isUserLoggedIn === null ? 'Chargement...' : "Commencer l'aventure"}
                                </span>
                                <ChevronRight className="ml-2" />
                            </Button>
                        </motion.div>
                    </div>


                    <motion.div
                        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/40"
                        animate={{ y: [0, 8, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <span className={cn("text-xs tracking-widest uppercase", aclonica.className)}>Découvrir</span>
                        <ChevronDown className="w-5 h-5" />
                    </motion.div>
                </section>

                <div className="section-divider mx-auto max-w-4xl my-4" />

                <DiceSection />

                <div className="section-divider mx-auto max-w-4xl my-4" />

                <motion.section
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="lg:pt-32 lg:pb-16">
                        <Features1 />
                    </div>
                </motion.section>

                <div className="section-divider mx-auto max-w-4xl my-4" />

                <motion.section
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="lg:pb-16">
                        <Features2 />
                    </div>
                </motion.section>

                <div className="section-divider mx-auto max-w-4xl my-4" />

                <motion.section
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="lg:pb-16">
                        <Features3 />
                    </div>
                </motion.section>

                <div className="section-divider mx-auto max-w-4xl my-4" />

                <motion.section
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="lg:pb-16">
                        <Features4 />
                    </div>
                </motion.section>

                <div className="section-divider mx-auto max-w-4xl my-4" />

                <motion.section
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <MockupCtaSection onStart={handleStartAdventure} />
                </motion.section>

                <div className="section-divider mx-auto max-w-4xl my-4" />

                <motion.section
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="py-16 md:py-24 space-y-10">
                        <div className="max-w-2xl mx-auto text-center px-6">
                            <h2 className={cn("text-4xl font-semibold lg:text-5xl gold-text-gradient", aclonica.className)}>
                                Plus de 1000 images et portraits
                            </h2>
                            <p className={cn("mt-6 text-lg text-white/60", aclonica.className)}>
                                Une bibliothèque massive de portraits, cartes et tokens pour donner vie à votre campagne.
                            </p>
                        </div>
                        <ImageAutoSlider />
                    </div>
                </motion.section>

                <div className="section-divider mx-auto max-w-4xl" />

                <StartCampaignSection onStart={handleStartAdventure} />
            </main>

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

            {isUserLoggedIn && (
                <UserProfileDialog
                    userId={auth.currentUser?.uid}
                    isOpen={isProfileOpen}
                    onClose={() => setIsProfileOpen(false)}
                />
            )}
            <Footer userData={userData} />
        </>
    )
}

const Footer = ({ userData }: { userData: any }) => {
    return (
        <footer className="relative z-10 py-16 px-6 lg:px-12 bg-[#0c0c0e]">
            <div className="mx-auto max-w-7xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                        <h2 className={cn("text-3xl md:text-4xl font-bold tracking-tight gold-text-gradient", aclonica.className)}>Un retour ?</h2>
                        <p className={cn("text-zinc-400 text-lg max-w-md", aclonica.className)}>
                            Votre avis nous aide à améliorer l&apos;aventure ! Dites-nous tout.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <FeedbackDialog userData={userData} />
                        </div>
                    </div>
                    <div className="flex flex-col md:items-end gap-6">
                        <Logo />
                        <div className="flex gap-6 text-zinc-500 text-sm">
                            <Link href="/mentions-legales" className="hover:text-[#c9a965] transition-colors">Mentions Légales</Link>
                        </div>
                        <p className="text-zinc-600 text-xs">
                            © {new Date().getFullYear()} YNER. Fait avec passion pour les rôlistes.
                        </p>
                    </div>
                </div>
            </div>
        </footer>
    )
}

const FeedbackDialog = ({ userData }: { userData: any }) => {
    const [open, setOpen] = React.useState(false)
    const [message, setMessage] = React.useState('')
    const [isSending, setIsSending] = React.useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSending(true)
        try {
            await addDoc(collection(db, "feedback"), {
                message,
                userEmail: auth.currentUser?.email || userData?.email || "Anonyme",
                userName: userData?.name || "Aventurier anonyme",
                userId: auth.currentUser?.uid || null,
                createdAt: serverTimestamp(),
            })
            setOpen(false)
            setMessage('')
        } catch (error) {
            console.error("Erreur lors de l'envoi du feedback vers Firestore:", error)
        } finally {
            setIsSending(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className={cn(
                    "rounded-full h-12 px-8",
                    "bg-[#c9a965] text-[#0c0c0e] hover:bg-[#f7d96d]",
                    "shadow-[0_0_20px_rgba(201,169,101,0.2)]",
                    aclonica.className
                )}>
                    <Mail className="mr-2 h-5 w-5" />
                    Nous écrire
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-[#0c0c0e] border-[#c9a965]/20 text-white shadow-2xl">
                <DialogHeader>
                    <DialogTitle className={cn("text-2xl gold-text-gradient", aclonica.className)}>Envoyer un feedback</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Une idée, un bug ou juste un mot doux ? Nous sommes à l&apos;écoute.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="message" className={cn("text-sm font-medium", aclonica.className)}>Message</Label>
                        <Textarea
                            id="message"
                            placeholder="Votre message ici..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                            disabled={isSending}
                            className="min-h-[150px] bg-white/5 border-[#c9a965]/20 focus:border-[#c9a965]/40 focus:ring-0 text-white resize-none"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            disabled={isSending}
                            className={cn(
                                "w-full h-12 rounded-xl group",
                                "bg-[#c9a965] text-[#0c0c0e] hover:bg-[#f7d96d]",
                                aclonica.className
                            )}
                        >
                            {isSending ? (
                                <span className="flex items-center">
                                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[#0c0c0e]/20 border-t-[#0c0c0e]" />
                                    Envoi en cours...
                                </span>
                            ) : (
                                <>
                                    <Send className="mr-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                    Envoyer directement
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
