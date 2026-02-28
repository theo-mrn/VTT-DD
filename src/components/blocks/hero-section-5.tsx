'use client'
import React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Menu, X, ChevronRight, Mail, Github, MessageSquare } from 'lucide-react'
import { useScroll, motion } from 'framer-motion'
import { Aclonica } from "next/font/google"
import Login06 from '@/components/ui/login-3'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth, db } from '../../lib/firebase'
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { Features1 } from '@/components/blocks/features1'
import { Features2 } from '@/components/blocks/features2'
import { Features3 } from '@/components/blocks/features3'
import { TestimonialsSection } from '@/components/ui/testimonial-v2'
import { ShaderBackground } from '@/components/ui/hero'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { LogOut, User, Gamepad2, Send } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"



const aclonica = Aclonica({
    weight: '400',
    subsets: ['latin'],
})

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
                                {isUserLoggedIn === null ? (
                                    <div className="w-10 h-10 rounded-full bg-zinc-200/20 animate-pulse" />
                                ) : isUserLoggedIn ? (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Avatar className="h-10 w-10 border-2 border-white/50 hover:border-white transition-all cursor-pointer shadow-md bg-white/5">
                                                <AvatarImage src={userData?.pp || ""} className="object-cover" />
                                                <AvatarFallback className="bg-[var(--accent-brown)] text-white font-bold">
                                                    {userData?.name ? userData.name.charAt(0).toUpperCase() : "?"}
                                                </AvatarFallback>
                                            </Avatar>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-white/10 text-white">
                                            <DropdownMenuItem onClick={onOpenProfile} className="focus:bg-white/10 focus:text-white cursor-pointer gap-2">
                                                <User className="w-4 h-4" />
                                                <span>Voir mon profil</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator className="bg-white/10" />
                                            <DropdownMenuItem onClick={() => signOut(auth)} className="focus:bg-red-500/20 focus:text-red-400 text-red-400 cursor-pointer gap-2">
                                                <LogOut className="w-4 h-4" />
                                                <span>Se déconnecter</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : (
                                    <Button
                                        onClick={onOpenAuth}
                                        size="sm"
                                        className={aclonica.className}>
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
        <div>
            <h1 className={aclonica.className}>YNER</h1>
        </div>
    )
}

export function HeroSection() {
    const [isAuthModalOpen, setIsAuthModalOpen] = React.useState(false)
    const [isProfileOpen, setIsProfileOpen] = React.useState(false)
    const [isUserLoggedIn, setIsUserLoggedIn] = React.useState<boolean | null>(null)
    const [userData, setUserData] = React.useState<any>(null)

    const router = useRouter()

    React.useEffect(() => {
        let unsubscribeDoc: () => void;
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setIsUserLoggedIn(!!user)
            if (user) {
                unsubscribeDoc = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        setUserData(docSnap.data())
                    }
                })
            } else {
                setUserData(null)
                if (unsubscribeDoc) unsubscribeDoc()
            }
        })
        return () => {
            unsubscribeAuth()
            if (unsubscribeDoc) unsubscribeDoc()
        }
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
            <HeroHeader
                onOpenAuth={() => setIsAuthModalOpen(true)}
                isUserLoggedIn={isUserLoggedIn}
                userData={userData}
                onOpenProfile={() => setIsProfileOpen(true)}
                router={router}
            />
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
                        <div className="fixed inset-0 -z-10 w-full h-full pointer-events-none">
                            <ShaderBackground />
                        </div>
                    </div>
                </section>



                <section>
                    <div className="lg:pt-64 lg:pb-16">
                        <div className="aspect-[2/3] relative mx-5 overflow-hidden rounded-3xl sm:aspect-video lg:rounded-[3rem]">
                            <div className="size-full">
                                <Features1 />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Troisième carte avec le composant Features */}
                <section>
                    <div className="lg:pb-16">
                        <div className="aspect-[2/3] relative mx-5 overflow-hidden rounded-3xl sm:aspect-video lg:rounded-[3rem]">
                            <div className="size-full">
                                <Features2 />
                            </div>
                        </div>
                    </div>
                </section>

                <section>
                    <div className="lg:pb-16">
                        <div className="aspect-[2/3] relative mx-5 overflow-hidden rounded-3xl sm:aspect-video lg:rounded-[3rem]">
                            <div className="size-full">
                                <Features3 />
                            </div>
                        </div>
                    </div>
                </section>
                <TestimonialsSection />
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
            {/* Modal de profil */}
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
        <footer className="relative z-10 py-16 px-6 lg:px-12 bg-black/40 backdrop-blur-xl border-t border-white/10 mt-20">
            <div className="mx-auto max-w-7xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    <div className="space-y-6">
                        <h2 className={cn("text-3xl md:text-4xl font-bold tracking-tight", aclonica.className)}>Un retour ?</h2>
                        <p className={cn("text-zinc-400 text-lg max-w-md", aclonica.className)}>
                            Votre avis nous aide à améliorer l'aventure ! Dites-nous tout.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <FeedbackDialog userData={userData} />
                        </div>
                    </div>
                    <div className="flex flex-col md:items-end gap-6">
                        <Logo />
                        <div className="flex gap-6 text-zinc-500 text-sm">
                            <Link href="/mentions-legales" className="hover:text-white transition-colors">Mentions Légales</Link>
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
                <Button className={cn("rounded-full h-12 px-8 shadow-lg shadow-primary/20", aclonica.className)}>
                    <Mail className="mr-2 h-5 w-5" />
                    Nous écrire
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-white/10 text-white shadow-2xl">
                <DialogHeader>
                    <DialogTitle className={cn("text-2xl", aclonica.className)}>Envoyer un feedback</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Une idée, un bug ou juste un mot doux ? Nous sommes à l'écoute.
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
                            className="min-h-[150px] bg-white/5 border-white/10 focus:border-white/20 focus:ring-0 text-white resize-none"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={isSending} className={cn("w-full h-12 rounded-xl group", aclonica.className)}>
                            {isSending ? (
                                <span className="flex items-center">
                                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
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