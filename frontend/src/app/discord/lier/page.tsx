'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CadrePublic } from '@/components/compte/cadre-public';
import { Bouton, Chargement, Message } from '@/components/compte/elements';
import { messageErreur } from '@/lib/api';
import { lierDiscord, nomDiscordDuJeton } from '@/lib/discord';
import { urlConnexion } from '@/lib/redirection';
import { useSession } from '@/lib/session';

/** Lie l'identité Discord du jeton (remis par /link dans Discord) au compte connecté. */
function Liaison() {
  const jeton = useSearchParams().get('jeton');
  const { statut, profil } = useSession();
  const router = useRouter();
  const [etat, setEtat] = useState<'pret' | 'envoi' | 'ok' | 'erreur'>('pret');
  const [erreur, setErreur] = useState<string | null>(null);

  // Pas connecté : connexion (tout moyen), puis retour ici avec le même jeton
  useEffect(() => {
    if (jeton && statut === 'anonyme')
      router.replace(urlConnexion(`/discord/lier?${new URLSearchParams({ jeton })}`));
  }, [jeton, statut, router]);

  if (!jeton) return <Message>Lien incomplet : refais /link dans Discord.</Message>;
  if (statut !== 'connecte') return <Chargement />;

  const nomDiscord = nomDiscordDuJeton(jeton);

  async function lier() {
    setEtat('envoi');
    try {
      await lierDiscord(jeton!);
      setEtat('ok');
    } catch (err) {
      setErreur(messageErreur(err));
      setEtat('erreur');
    }
  }

  if (etat === 'ok')
    return (
      <Message ton="succes">Compte Discord lié. Retourne sur Discord : /room puis /roll.</Message>
    );

  return (
    <div className="space-y-4">
      <p className="text-center">
        {nomDiscord ? <strong>{nomDiscord}</strong> : 'Discord'} → <strong>{profil?.name}</strong>
      </p>
      {etat === 'erreur' && <Message>{erreur}</Message>}
      <Bouton className="h-10 w-full" onClick={lier} chargement={etat === 'envoi'}>
        Lier
      </Bouton>
    </div>
  );
}

export default function PageLiaisonDiscord() {
  return (
    <CadrePublic titre="Lier Discord">
      <Suspense fallback={<Chargement />}>
        <Liaison />
      </Suspense>
    </CadrePublic>
  );
}
