'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { HeroSection } from "@/components/blocks/hero-section-5"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('frame_id')) {
      router.replace('/discord' + window.location.search)
    }
  }, [router])

  return <div className="relative">
    <HeroSection />
  </div>
}
