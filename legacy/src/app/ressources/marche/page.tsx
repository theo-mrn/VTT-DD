'use client'

import React, { useState } from 'react'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { AppBackground } from '@/components/ui/background-components'
import { useSession } from '@/data/identity'
import Marketplace from "@/components/(infos)/Information"

export default function MarchePage() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isStoreOpen, setIsStoreOpen] = useState(false)
  // Session partagée : aucune requête ici, le profil est suivi en temps réel par le store
  const { user, profile } = useSession()
  const userData = profile?.raw ?? null

  return (
    <AppBackground className="text-[var(--text-primary)]">
      <div className="pointer-events-none absolute top-0 right-0 w-[600px] h-[500px] z-0" style={{ backgroundImage: 'radial-gradient(ellipse 60% 50% at 80% 0%, rgba(192,160,128,0.08) 0%, transparent 70%)' }} />

      <div className="relative z-10 h-screen flex flex-col overflow-hidden">
        <AppNavbar
          variant="home"
          isUserLoggedIn={!!user}
          userData={userData}
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenStore={() => setIsStoreOpen(true)}
        />

        <main className="flex-1 min-h-0 overflow-hidden pt-20">
          <Marketplace />
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
