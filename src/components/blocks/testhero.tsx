'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../../lib/firebase'
import Hero from "@/components/ui/animated-shader-hero"

// Demo Component showing how to use the Hero
const HeroDemo: React.FC = () => {
  const [isUserLoggedIn, setIsUserLoggedIn] = React.useState<boolean | null>(null)
  const router = useRouter()

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsUserLoggedIn(!!user)
    })
    return () => unsubscribe()
  }, [])

  const handlePrimaryClick = () => {
    if (isUserLoggedIn) {
      router.push('/Salle')
    } else {
      // Ouvrir la modal d'authentification
      console.log('Ouvrir la modal d\'authentification')
    }
  }

  const handleSecondaryClick = () => {
    console.log('S\'identifier clicked')
    // Ouvrir la modal d'authentification
  }

  return (
    <div className="w-full">
      <Hero
        trustBadge={{
          text: "Plateforme VTT pour Donjons & Dragons",
          icons: ["🎲"]
        }}
        headline={{
          line1: "Votre table",
          line2: "virtuelle ultime"
        }}
        subtitle="Créez des aventures épiques avec votre groupe. Plateforme VTT simple et intuitive."
        buttons={{
          primary: {
            text: isUserLoggedIn === null ? "Chargement..." : "Commencer l'aventure",
            onClick: handlePrimaryClick
          },
          secondary: {
            text: "S'identifier",
            onClick: handleSecondaryClick
          }
        }}
      />
    </div>
  )
}

export default HeroDemo