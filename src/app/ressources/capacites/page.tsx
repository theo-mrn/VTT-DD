'use client'

import React, { useState, useEffect } from 'react'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { AppBackground } from '@/components/ui/background-components'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import Capacites from "@/components/(infos)/capacites"

export default function CapacitesPage() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isStoreOpen, setIsStoreOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [userData, setUserData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          setUserData(userDoc.data())
        }
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  return (
    <AppBackground className="text-[var(--text-primary)]">
      <div className="pointer-events-none absolute top-0 left-1/4 w-[800px] h-[600px] z-0" style={{ backgroundImage: 'radial-gradient(ellipse 70% 50% at 30% 0%, rgba(192,160,128,0.08) 0%, transparent 70%)' }} />

      <div className="relative z-10 h-screen flex flex-col overflow-hidden">
        <AppNavbar
          variant="home"
          isUserLoggedIn={!!user}
          userData={userData}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenStore={() => setIsStoreOpen(true)}
        />

        <main className="flex-1 overflow-hidden pt-20">
          <Capacites />
        </main>
      </div>

      <UserProfileDialog
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        userId={user?.uid}
      />

      <StoreModal
        isOpen={isStoreOpen}
        onClose={() => setIsStoreOpen(false)}
      />
    </AppBackground>
  )
}
