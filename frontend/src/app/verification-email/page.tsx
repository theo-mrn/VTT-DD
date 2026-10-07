'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('auth');
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
        <Link href="/profil">{t('verify.toProfile')}</Link>
      </Bouton>
    ) : (
      <Bouton asChild className="h-10 w-full">
        <Link href="/connexion">{t('form.signIn')}</Link>
      </Bouton>
    );

  if (!jeton)
    return (
      <div className="space-y-4">
        <Message>{t('verify.missingToken')}</Message>
        {suite}
      </div>
    );

  if (etat === 'attente') return <Chargement texte={t('verify.checking')} />;

  return (
    <div className="space-y-4">
      {etat === 'ok' ? (
        <Message ton="succes">{t('verify.done')}</Message>
      ) : (
        <Message>{t('verify.failed', { error: erreur ?? '' })}</Message>
      )}
      {suite}
    </div>
  );
}

export default function PageVerificationEmail() {
  const t = useTranslations('auth.verify');
  return (
    <CadrePublic titre={t('title')}>
      <Suspense fallback={<Chargement />}>
        <Verification />
      </Suspense>
    </CadrePublic>
  );
}
