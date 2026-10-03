'use client'

import React, { useState } from 'react'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { UserProfileDialog } from '@/components/profile/UserProfileDialog'
import { StoreModal } from '@/components/store/store-modal'
import { useSession } from '@/data/identity'
import Images from "@/components/(infos)/images"

export default function ImagesPage() {
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isStoreOpen, setIsStoreOpen] = useState(false)
  // Session partagée : aucune requête ici, le profil est suivi en temps réel par le store
  const { user, profile } = useSession()
  const userData = profile?.raw ?? null

  return (
    <div className="min-h-screen w-full relative">
      {/* Global Background */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('https://assets.yner.fr/images/index2.webp')" }}
      />
      <div className="fixed inset-0 z-0 backdrop-blur-sm" style={{ background: 'color-mix(in srgb, var(--bg-canvas) 80%, transparent)' }} />

      <AppNavbar
        variant="home"
        isUserLoggedIn={!!user}
        userData={userData}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenStore={() => setIsStoreOpen(true)}
      />

      <main className="relative z-10 pt-24 pb-12 px-4 container mx-auto h-[calc(100vh-6rem)] overflow-auto">
        <Images />
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
