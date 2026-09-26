'use client';

import { RotateCcw, Skull } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Erreur d'une page : affichée à la place de la page, dans le même esprit que
 * la page introuvable. Sans elle, Next retombe sur la page d'erreur de
 * l'ancien routeur (`router.isReady` introuvable dans l'App Router).
 */
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
      <Skull className="mb-8 h-24 w-24 text-primary opacity-30" strokeWidth={1} />
      <h1 className="mb-4 text-3xl font-bold text-foreground">Échec critique</h1>
      <p className="mx-auto mb-2 max-w-md text-lg text-muted-foreground">
        Les dés ont roulé du mauvais côté : cette page a rencontré une erreur.
      </p>
      {error.digest && (
        <p className="mb-8 font-mono text-xs text-muted-foreground">Référence : {error.digest}</p>
      )}
      <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
        <Button size="lg" className="gap-2" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Relancer
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/">Retour à l&apos;accueil</Link>
        </Button>
      </div>
    </div>
  );
}
