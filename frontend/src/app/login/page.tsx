'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { LoginForm } from '@/components/auth/login-form';
import { internalPath } from '@/lib/redirect';
import { useSession } from '@/lib/session';

const ERRORS: Record<string, string> = {
  oauth: 'La connexion avec Google ou Discord a échoué. Réessayez, ou connectez-vous par e-mail.',
};

function Login() {
  const { status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  // Page demandée avant la connexion (?redirect=/amis), sinon le profil
  const returnTo = internalPath(params.get('redirect'));
  const errorCode = params.get('erreur');
  const error = errorCode ? (ERRORS[errorCode] ?? 'La connexion a échoué.') : null;

  useEffect(() => {
    if (status === 'connecte') router.replace(returnTo);
  }, [status, router, returnTo]);

  return (
    <LoginForm
      redirection={returnTo}
      initialError={error}
      onLoggedIn={() => router.replace(returnTo)}
    />
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0c0e] p-4">
      <Suspense>
        <Login />
      </Suspense>
    </main>
  );
}
