'use client';

/**
 * Retour de Stripe Checkout après paiement (`?session_id=…&retour=…`) : attend
 * la confirmation de billing (le webhook peut arriver après le retour), puis
 * rafraîchit les dés possédés et propose de revenir là où l'on était.
 */
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Crown, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { PAGES_FRONT } from '@vtt/contracts';
import { Page } from '@/components/commun/page';
import { Bouton, Carte, Message } from '@/components/compte/elements';
import { lireSession, retourSur, type EtatSession } from '@/lib/abonnement';
import { messageErreur } from '@/lib/api';
import { dicePreferencesKey } from '@/lib/dice-preferences';

const INTERVALLE_MS = 1500;
const ESSAIS = 20;

export default function PagePaiementSucces() {
  return (
    <Suspense>
      <Confirmation />
    </Suspense>
  );
}

function Confirmation() {
  const params = useSearchParams();
  const sessionId = params.get('session_id');
  const retour = retourSur(params.get('retour'));
  const client = useQueryClient();
  const [session, setSession] = useState<EtatSession | null>(null);
  const [attente, setAttente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let fini = false;
    let essai = 0;
    let minuterie: ReturnType<typeof setTimeout>;
    const verifier = async () => {
      try {
        const s = await lireSession(sessionId);
        if (fini) return;
        setSession(s);
        if (s.status === 'completed') {
          void client.invalidateQueries({ queryKey: dicePreferencesKey });
          return;
        }
        if (s.status === 'expired') return;
      } catch (err) {
        if (fini) return;
        setErreur(messageErreur(err));
        return;
      }
      if (++essai >= ESSAIS) return setAttente(true);
      minuterie = setTimeout(() => void verifier(), INTERVALLE_MS);
    };
    void verifier();
    return () => {
      fini = true;
      clearTimeout(minuterie);
    };
  }, [sessionId, client]);

  const termine = session?.status === 'completed';
  let contenu;
  if (!sessionId || erreur) contenu = <Message>{erreur ?? 'Paiement introuvable.'}</Message>;
  else if (session?.status === 'expired') contenu = <Message>Ce paiement a expiré.</Message>;
  else if (termine)
    contenu = (
      <div className="flex flex-col items-center gap-3 text-center">
        {session.kind === 'premium' ? (
          <Crown className="size-10 text-primary" aria-hidden />
        ) : (
          <CheckCircle2 className="size-10 text-success" aria-hidden />
        )}
        <h1 className="text-xl font-semibold tracking-tight">
          {session.kind === 'premium' ? 'Bienvenue dans Premium' : 'Merci pour votre achat'}
        </h1>
      </div>
    );
  else if (attente)
    contenu = (
      <div className="flex flex-col items-center gap-3 text-center">
        <Clock className="size-10 text-primary" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">
          Paiement reçu, confirmation en cours
        </h1>
      </div>
    );
  else
    contenu = (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Confirmation du paiement…
      </div>
    );

  return (
    <Page className="max-w-lg">
      <Carte>
        {contenu}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Bouton asChild>
            <Link href={retour}>Continuer</Link>
          </Bouton>
          {retour !== PAGES_FRONT.abonnement && (
            <Bouton ton="secondaire" asChild>
              <Link href={PAGES_FRONT.abonnement}>Mon abonnement</Link>
            </Bouton>
          )}
        </div>
      </Carte>
    </Page>
  );
}
