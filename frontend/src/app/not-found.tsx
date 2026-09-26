import { Dices, Map } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Page introuvable, reprise de l'ancienne app. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <div className="relative mb-8">
        <Dices className="mx-auto h-32 w-32 text-primary opacity-20" strokeWidth={1} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-6xl font-black text-transparent">
            404
          </span>
        </div>
      </div>

      <h1 className="mb-4 text-3xl font-bold text-foreground">Échec Critique en Perception</h1>

      <p className="mx-auto mb-8 max-w-md text-lg text-muted-foreground">
        Vous avez fouillé la zone de fond en comble, mais la page que vous cherchez semble avoir été
        engloutie par un mimique ou n&apos;a simplement jamais existé.
      </p>

      <div className="flex flex-col justify-center gap-4 sm:flex-row">
        <Button asChild size="lg" className="gap-2">
          <Link href="/">
            <Map className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link href="/join">Trouver une partie</Link>
        </Button>
      </div>
    </div>
  );
}
