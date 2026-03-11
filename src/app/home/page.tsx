'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Gamepad2, Users, Play, Store } from 'lucide-react'
import { auth, db, doc, getDoc } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Aclonica } from "next/font/google"
import { motion } from 'framer-motion'

const aclonica = Aclonica({ weight: '400', subsets: ['latin'] })

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [userData, setUserData] = useState<any>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isStoreOpen, setIsStoreOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid)
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          setUserData(userDoc.data())
        }
      } else {
        setUserId(null)
        setUserData(null)
      }
    })
    return () => unsubscribe()
  }, [])

  return (
    <div
      className="min-h-screen text-[var(--text-primary)] font-body relative"
      style={{
        backgroundImage: `url('https://assets.yner.fr/images/index2.webp')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Overlay to ensure text readability over the background image */}
      <div className="absolute inset-0 bg-[var(--bg-canvas)]/80 backdrop-blur-sm z-0"></div>

      <div className="relative z-10">
        <AppNavbar
          variant="home"
          isUserLoggedIn={userId !== null}
          userData={userData}
          onOpenAuth={() => router.push('/auth')}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenStore={() => setIsStoreOpen(true)}
        />

        {isProfileOpen && <UserProfileDialog isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} userId={userId} />}

        <StoreModal
          isOpen={isStoreOpen}
          onClose={() => setIsStoreOpen(false)}
        />

        <div className="container mx-auto px-6 py-8 pt-32 pb-24">
          <div className="max-w-6xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h1 className={`text-5xl md:text-6xl font-bold text-[var(--accent-brown)] tracking-tight drop-shadow-md ${aclonica.className}`}>
                Bienvenue Yner
              </h1>
              <p className="text-xl text-[var(--text-primary)] max-w-2xl mx-auto font-medium drop-shadow-sm">
                L'aventure vous attend. Créez votre propre légende ou rejoignez une quête épique.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card Mes Campagnes (Large Feature) */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="md:col-span-2 md:row-span-2 h-full"
              >
                <Card
                  className="group relative h-full cursor-pointer border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent-brown)] transition-all duration-500 shadow-2xl overflow-hidden flex flex-col"
                  onClick={() => router.push('/mes-campagnes')}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-brown)]/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <CardHeader className="relative z-10 pb-4">
                    <CardTitle className={`text-3xl md:text-4xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>Mes campagnes</CardTitle>
                  </CardHeader>

                  <CardContent className="relative z-10 flex flex-col flex-1 justify-between gap-8 pt-4">
                    <p className="text-xl text-[var(--text-secondary)] max-w-lg leading-relaxed">
                      Reprenez là où vous vous êtes arrêté. Accédez à vos parties sauvegardées, vos personnages et l'histoire de vos mondes.
                    </p>
                    <div className="flex items-center gap-3 text-[var(--accent-brown)] text-lg font-bold group-hover:gap-6 transition-all mt-auto pb-4">
                      <span>Continuer l'aventure</span>
                      <Play className="h-5 w-5 fill-current" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Card Rejoindre */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <Card
                  className="group relative h-full cursor-pointer border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent-brown)] transition-all duration-500 shadow-xl overflow-hidden"
                  onClick={() => router.push('/rejoindre')}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent-brown)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <CardHeader className="relative z-10 pb-2">
                    <CardTitle className={`text-xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>Rejoindre</CardTitle>
                  </CardHeader>
                  <CardContent className="relative z-10 space-y-4">
                    <p className="text-sm text-[var(--text-secondary)]">Connectez-vous à une table existante avec un code d'invitation.</p>
                    <div className="flex items-center gap-2 text-[var(--accent-brown)] font-bold text-sm group-hover:gap-4 transition-all">
                      <span>Entrer</span>
                      <Play className="h-4 w-4 fill-current" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Card Créer */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card
                  className="group relative h-full cursor-pointer border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent-brown)] transition-all duration-500 shadow-xl overflow-hidden"
                  onClick={() => router.push('/creer')}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent-brown)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <CardHeader className="relative z-10 pb-2">
                    <CardTitle className={`text-xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>Créer</CardTitle>
                  </CardHeader>
                  <CardContent className="relative z-10 space-y-4">
                    <p className="text-sm text-[var(--text-secondary)]">Devenez le Maître du Jeu et forgez votre propre monde.</p>
                    <div className="flex items-center gap-2 text-[var(--accent-brown)] font-bold text-sm group-hover:gap-4 transition-all">
                      <span>Forger</span>
                      <Plus className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Card Boutique (Wide Bottom) */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="md:col-span-3"
              >
                <Card
                  className="group relative cursor-pointer border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent-brown)] transition-all duration-500 shadow-xl overflow-hidden"
                  onClick={() => setIsStoreOpen(true)}
                >
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-[var(--accent-brown)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[var(--accent-brown)]/5 via-transparent to-[var(--accent-brown)]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                    <div className="flex items-center gap-6">
                      <div className="p-4 rounded-xl bg-[var(--bg-dark)] shadow-inner group-hover:rotate-12 transition-transform duration-500">
                        <Store className="h-10 w-10 text-[var(--accent-brown)]" />
                      </div>
                      <div>
                        <h3 className={`text-2xl font-bold text-[var(--accent-brown)] ${aclonica.className}`}>La Boutique d'Yner</h3>
                        <p className="text-[var(--text-secondary)]">Équipez vos personnages avec des ressources légendaires et des visuels exclusifs.</p>
                      </div>
                    </div>
                    <Button
                      className="bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] font-bold px-8 h-12 rounded-xl transition-all hover:scale-105 active:scale-95"
                    >
                      Ouvrir l'échoppe
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
