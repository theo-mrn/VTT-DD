'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/** Bouton principal : inscription pour un visiteur, l'application pour un joueur connecté. */
export function BoutonCommencer({
  libelle = 'Commencer gratuitement',
  className,
}: Readonly<{ libelle?: string; className?: string }>) {
  const { statut } = useSession();
  const connecte = statut === 'connecte';
  return (
    <Button size="lg" asChild className={cn('group h-12 rounded-full px-7 text-[15px]', className)}>
      <Link href={connecte ? '/accueil' : '/connexion?mode=inscription'}>
        {connecte ? 'Ouvrir Yner' : libelle}
        <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </Button>
  );
}

/** Lien de connexion de la barre de navigation, masqué une fois connecté. */
export function LienConnexion() {
  const { statut } = useSession();
  if (statut === 'connecte') return null;
  return (
    <Link
      href="/connexion"
      className="whitespace-nowrap rounded-full px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:px-4"
    >
      Se connecter
    </Link>
  );
}
