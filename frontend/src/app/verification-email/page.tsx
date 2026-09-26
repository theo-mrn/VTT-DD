'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CadrePublic } from '@/components/compte/cadre-public';
import { Bouton, Chargement, Message } from '@/components/compte/elements';
import { messageErreur } from '@/lib/api';
import { verifierEmail } from '@/lib/securite';
import { useSession } from '@/lib/session';

// Le jeton ne sert qu'une fois : une seule requête par jeton, même si l'effet est rejoué
const verifications = new Map<string, Promise<void>>();

function Verification() {
  const jeton = useSearchParams().get('jeton');
  const { statut, rechargerProfil } = useSession();
  const [etat, setEtat] = useState<'attente' | 'ok' | 'erreur'>('attente');
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!jeton) return;
    let promesse = verifications.get(jeton);
    if (!promesse) {
      promesse = verifierEmail(jeton);
      verifications.set(jeton, promesse);
    }
    let actif = true;
    promesse
      .then(() => actif && setEtat('ok'))
      .catch((err) => {
        if (!actif) return;
        setErreur(messageErreur(err));
        setEtat('erreur');
      });
    return () => {
      actif = false;
    };
  }, [jeton]);

  // Le profil affiché doit refléter l'e-mail vérifié
  useEffect(() => {
    if (etat === 'ok' && statut === 'connecte') rechargerProfil().catch(() => undefined);
  }, [etat, statut, rechargerProfil]);

  const suite =
    statut === 'connecte' ? (
      <Bouton asChild className="h-10 w-full">
        <Link href="/profil">Aller à mon profil</Link>
      </Bouton>
    ) : (
      <Bouton asChild className="h-10 w-full">
        <Link href="/connexion">Se connecter</Link>
      </Bouton>
    );

  if (!jeton)
    return (
      <div className="space-y-4">
        <Message>Ce lien est incomplet : il manque le jeton de vérification.</Message>
        {suite}
      </div>
    );

  if (etat === 'attente') return <Chargement texte="Vérification de votre adresse…" />;

  return (
    <div className="space-y-4">
      {etat === 'ok' ? (
        <Message ton="succes">Adresse e-mail vérifiée, merci !</Message>
      ) : (
        <Message>{erreur} Vous pouvez demander un nouveau lien depuis votre profil.</Message>
      )}
      {suite}
    </div>
  );
}

export default function PageVerificationEmail() {
  return (
    <CadrePublic titre="Vérification de l'e-mail">
      <Suspense fallback={<Chargement />}>
        <Verification />
      </Suspense>
    </CadrePublic>
  );
}
