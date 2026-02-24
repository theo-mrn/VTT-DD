import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Map, Dices } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-background flex flex-col justify-center items-center p-6 text-center">
            <div className="relative mb-8">
                <Dices className="h-32 w-32 text-primary opacity-20 mx-auto" strokeWidth={1} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl font-black bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        404
                    </span>
                </div>
            </div>

            <h1 className="text-3xl font-bold text-foreground mb-4">
                Échec Critique en Perception
            </h1>

            <p className="text-muted-foreground text-lg max-w-md mx-auto mb-8">
                Vous avez fouillé la zone de fond en comble, mais la page que vous cherchez semble avoir été engloutie par un mimique ou n'a simplement jamais existé.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button asChild size="lg" className="gap-2">
                    <Link href="/">
                        <Map className="h-4 w-4" />
                        Retour à l'accueil
                    </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="gap-2">
                    <Link href="/Salle">
                        Trouver une partie
                    </Link>
                </Button>
            </div>
        </div>
    );
}
