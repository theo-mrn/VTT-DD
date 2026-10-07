'use client';

import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { CadreAuth } from '@/components/auth/cadre-auth';
import { FormulaireConnexion } from '@/components/auth/formulaire-connexion';
import { cheminInterne } from '@/lib/redirection';
import { useSession } from '@/lib/session';

function Connexion() {
  const t = useTranslations('auth.form');
  const { statut } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  // Page demandée avant la connexion (?redirect=/amis), sinon l'accueil
  const retour = cheminInterne(params.get('redirect'), '/accueil');
  const codeErreur = params.get('erreur');
  const erreur = codeErreur ? t(codeErreur === 'oauth' ? 'oauthFailed' : 'failed') : null;

  useEffect(() => {
    if (statut === 'connecte') router.replace(retour);
  }, [statut, router, retour]);

  return (
    <FormulaireConnexion
      redirection={retour}
      erreurInitiale={erreur}
      modeInitial={params.get('mode') === 'inscription' ? 'inscription' : 'connexion'}
      // Un nouveau compte passe par l'onboarding avant la page demandée
      onConnecte={(mode) =>
        router.replace(
          mode === 'inscription' ? `/bienvenue?${new URLSearchParams({ suite: retour })}` : retour,
        )
      }
    />
  );
}

export default function PageConnexion() {
  return (
    <CadreAuth>
      <Suspense>
        <Connexion />
      </Suspense>
    </CadreAuth>
  );
}
