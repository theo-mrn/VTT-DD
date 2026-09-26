'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { FormulaireConnexion } from '@/components/auth/formulaire-connexion';
import { cheminInterne } from '@/lib/redirection';
import { useSession } from '@/lib/session';

const ERREURS: Record<string, string> = {
  oauth: 'La connexion avec Google ou Discord a échoué. Réessayez, ou connectez-vous par e-mail.',
};

function Connexion() {
  const { statut } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  // Page demandée avant la connexion (?redirect=/amis), sinon le profil
  const retour = cheminInterne(params.get('redirect'));
  const codeErreur = params.get('erreur');
  const erreur = codeErreur ? (ERREURS[codeErreur] ?? 'La connexion a échoué.') : null;

  useEffect(() => {
    if (statut === 'connecte') router.replace(retour);
  }, [statut, router, retour]);

  return (
    <FormulaireConnexion
      redirection={retour}
      erreurInitiale={erreur}
      onConnecte={() => router.replace(retour)}
    />
  );
}

export default function PageConnexion() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0c0e] p-4">
      <Suspense>
        <Connexion />
      </Suspense>
    </main>
  );
}
