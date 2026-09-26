'use client'

import React, { useState } from 'react'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { AppBackground } from '@/components/ui/background-components'
import { useSession } from '@/data/identity'
import Capacites from "@/components/(infos)/capacites"

export default function CapacitesPage() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isStoreOpen, setIsStoreOpen] = useState(false)
  // Session partagée : aucune requête ici, le profil est suivi en temps réel par le store
  const { user, profile } = useSession()
  const userData = profile?.raw ?? null

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
