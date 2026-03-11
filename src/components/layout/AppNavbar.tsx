'use client'

import React from 'react'
import Navbar from '@/components/ui/navbar'

interface AppNavbarProps {
  variant: 'landing' | 'home'
  isUserLoggedIn: boolean | null
  userData?: any
  onOpenAuth?: () => void
  onOpenProfile?: () => void
  onOpenStore?: () => void
}

export function AppNavbar({ variant, isUserLoggedIn, userData, onOpenAuth, onOpenProfile, onOpenStore }: AppNavbarProps) {
  // We use the modern Navbar component from UI
  return (
    <Navbar
      isUserLoggedIn={isUserLoggedIn}
      userData={userData}
      onOpenAuth={onOpenAuth}
      onOpenProfile={onOpenProfile}
      onOpenStore={onOpenStore}
      logo={{
        url: "/",
        src: "/logo.png",
        alt: "YNER Logo",
        title: "YNER"
      }}
    />
  )
}
