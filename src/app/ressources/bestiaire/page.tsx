'use client'

import React, { useState, useEffect } from 'react'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { auth, db } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import Glossary from "@/components/(infos)/Glossary"

export default function BestiairePage() {
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
    <div className="min-h-screen w-full relative">
      {/* Global Background */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('https://assets.yner.fr/images/index6.webp')" }}
      />
      <div className="fixed inset-0 z-0 bg-[var(--bg-canvas)]/80 backdrop-blur-sm" />

      <AppNavbar 
        variant="home" 
        isUserLoggedIn={!!user} 
        userData={userData}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenStore={() => setIsStoreOpen(true)}
      />

      <main className="relative z-10 pt-24 pb-12 px-4 container mx-auto h-[calc(100vh-6rem)] overflow-auto">
        <Glossary />
      </main>

      <UserProfileDialog 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        userId={user?.uid}
      />
      
      <StoreModal 
        isOpen={isStoreOpen} 
        onClose={() => setIsStoreOpen(false)} 
      />
    </div>
  )
}
