import { HeroSection } from "@/components/blocks/hero-section-5"
import { DiceSection } from "@/components/blocks/dice-section"
import Link from "next/link"

export default function Home() {
    return <div className="relative">
        <HeroSection />
        <DiceSection />
    </div>
}