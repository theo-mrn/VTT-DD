'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '@/components/account/elements';

/** Lien d'invitation : la page « Rejoindre » s'en charge avec le code en paramètre. */
export default function InvitationPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/join?${new URLSearchParams({ code: decodeURIComponent(code) })}`);
  }, [code, router]);

  return <Loading text="Ouverture de l'invitation…" />;
}
