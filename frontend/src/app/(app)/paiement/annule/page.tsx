'use client';

/** Retour de Stripe Checkout sans paiement (`?retour=…`) : rien n'a été débité. */
import { XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Page } from '@/components/commun/page';
import { Bouton, Carte } from '@/components/compte/elements';
import { retourSur } from '@/lib/abonnement';

export default function PagePaiementAnnule() {
  return (
    <Suspense>
      <Annulation />
    </Suspense>
  );
}

function Annulation() {
  const t = useTranslations('account.payment');
  const retour = retourSur(useSearchParams().get('retour'));
  return (
    <Page className="max-w-lg">
      <Carte>
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle className="size-10 text-subtle" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">{t('cancelled')}</h1>
          <p className="text-sm text-muted-foreground">{t('nothingCharged')}</p>
        </div>
        <div className="mt-6 flex justify-center">
          <Bouton asChild>
            <Link href={retour}>{t('back')}</Link>
          </Bouton>
        </div>
      </Carte>
    </Page>
  );
}
