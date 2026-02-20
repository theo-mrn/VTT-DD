import { HeroSection } from "@/components/blocks/hero-section-5"
import Link from "next/link"

export default function Home() {
    return <div>
        <HeroSection />
        <footer className="w-full py-4 text-center text-sm text-foreground/60 border-t border-border/40 bg-background z-50">
            <p>
                © {new Date().getFullYear()} YNER. Tous droits réservés. |{" "}
                <Link href="/mentions-legales" className="hover:underline">
                    Mentions Légales & CGU
                </Link>
            </p>
        </footer>
    </div>
}