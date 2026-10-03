'use client';

import { DoorOpen } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { EtatVide } from '@/components/commun/page';
import { Chargement } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import { useRejoindreCampagne } from '@/lib/campagnes';

/**
 * Lien d'invitation (`<APP_URL>/join/<code>`, créé par le MJ) : rejoint la
 * campagne avec ce code, puis ouvre le choix du héros, comme la saisie d'un code.
 */
export default function PageRejoindreParLien() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const rejoindre = useRejoindreCampagne();
  const lance = useRef(false);

  useEffect(() => {
    if (lance.current) return;
    lance.current = true;
    rejoindre.mutate(decodeURIComponent(code), {
      onSuccess: (c) => router.replace(`/campagnes/${c.id}/personnage`),
    });
  }, [code, rejoindre, router]);

  if (!rejoindre.isError) return <Chargement texte="Entrée dans la campagne…" />;
  return (
    <div className="px-4 py-20">
      <EtatVide
        icone={DoorOpen}
        titre="Invitation invalide"
        description={messageErreur(rejoindre.error)}
        action={
          <Button asChild variant="secondary">
            <Link href="/campagnes?rejoindre=1">Rejoindre une campagne</Link>
          </Button>
        }
      />
    </div>
  );
}
