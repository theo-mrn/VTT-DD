'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PublicFrame } from '@/components/account/public-frame';
import { AppButton, Loading, Message } from '@/components/account/elements';
import { errorMessage } from '@/lib/api';
import { verifyEmail } from '@/lib/security';
import { useSession } from '@/lib/session';

// Le jeton ne sert qu'une fois : une seule requête par jeton, même si l'effet est rejoué
const verifications = new Map<string, Promise<void>>();

function Verification() {
  const token = useSearchParams().get('jeton');
  const { status, reloadProfile } = useSession();
  const [state, setState] = useState<'attente' | 'ok' | 'erreur'>('attente');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let promise = verifications.get(token);
    if (!promise) {
      promise = verifyEmail(token);
      verifications.set(token, promise);
    }
    let active = true;
    promise
      .then(() => active && setState('ok'))
      .catch((err) => {
        if (!active) return;
        setError(errorMessage(err));
        setState('erreur');
      });
    return () => {
      active = false;
    };
  }, [token]);

  // Le profil affiché doit refléter l'e-mail vérifié
  useEffect(() => {
    if (state === 'ok' && status === 'connecte') reloadProfile().catch(() => undefined);
  }, [state, status, reloadProfile]);

  const suffix =
    status === 'connecte' ? (
      <AppButton asChild className="h-10 w-full">
        <Link href="/profile">Aller à mon profil</Link>
      </AppButton>
    ) : (
      <AppButton asChild className="h-10 w-full">
        <Link href="/login">Se connecter</Link>
      </AppButton>
    );

  if (!token)
    return (
      <div className="space-y-4">
        <Message>Ce lien est incomplet : il manque le jeton de vérification.</Message>
        {suffix}
      </div>
    );

  if (state === 'attente') return <Loading text="Vérification de votre adresse…" />;

  return (
    <div className="space-y-4">
      {state === 'ok' ? (
        <Message tone="succes">Adresse e-mail vérifiée, merci !</Message>
      ) : (
        <Message>{error} Vous pouvez demander un nouveau lien depuis votre profil.</Message>
      )}
      {suffix}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <PublicFrame title="Vérification de l'e-mail">
      <Suspense fallback={<Loading />}>
        <Verification />
      </Suspense>
    </PublicFrame>
  );
}
