'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  AvatarJoueur,
  Bouton,
  Carte,
  Chargement,
  Message,
  formaterDuree,
} from '@/components/compte/elements';
import { aclonica, styleLien } from '@/components/compte/styles';
import {
  accepterDemande,
  demanderEnAmi,
  retirerAmi,
  supprimerDemande,
  useRelations,
} from '@/lib/amis';
import { lireJoueur } from '@/lib/profil';
import { useRessource } from '@/lib/ressource';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';

/** Profil public d'un joueur (GET /v1/users/:id), avec la relation d'amitié. */
export default function PageJoueur() {
  const { id } = useParams<{ id: string }>();
  const moi = useProfil();
  const joueur = useRessource(id ? `joueur-${id}` : null, () => lireJoueur(id));
  const { relation, agir, enCours, erreur } = useRelations(moi.id);

  if (joueur.chargement && !joueur.donnees) return <Chargement />;
  if (joueur.erreur || !joueur.donnees) {
    return (
      <Carte>
        <Message>{joueur.erreur ?? 'Joueur introuvable.'}</Message>
        <Link href="/amis" className={cn('mt-4 inline-block', styleLien)}>
          Retour aux amis
        </Link>
      </Carte>
    );
  }

  const p = joueur.donnees;
  const lien = relation(p.id);
  const occupe = enCours === p.id;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div
          className="h-36 bg-zinc-800 bg-cover bg-center sm:h-44"
          style={p.bannerUrl ? { backgroundImage: `url(${p.bannerUrl})` } : undefined}
        />
        <div className="space-y-4 p-6">
          <div className="-mt-16 flex flex-wrap items-end gap-4">
            <AvatarJoueur nom={p.name} url={p.avatarUrl} bordure={p.borderType} taille="xl" />
            <div className="min-w-0 flex-1">
              <h1 className={cn('truncate text-2xl text-white sm:text-3xl', aclonica)}>{p.name}</h1>
              {p.title && <p className="text-[#c9a965]">{p.title}</p>}
            </div>
            <div className="flex gap-2">
              {lien === 'moi' && (
                <Bouton asChild ton="secondaire">
                  <Link href="/profil">Modifier mon profil</Link>
                </Bouton>
              )}
              {lien === 'aucune' && (
                <Bouton chargement={occupe} onClick={() => agir(p.id, demanderEnAmi)}>
                  Ajouter en ami
                </Bouton>
              )}
              {lien === 'envoyee' && (
                <Bouton
                  ton="secondaire"
                  chargement={occupe}
                  onClick={() => agir(p.id, supprimerDemande)}
                >
                  Annuler la demande
                </Bouton>
              )}
              {lien === 'recue' && (
                <>
                  <Bouton chargement={occupe} onClick={() => agir(p.id, accepterDemande)}>
                    Accepter
                  </Bouton>
                  <Bouton
                    ton="secondaire"
                    disabled={occupe}
                    onClick={() => agir(p.id, supprimerDemande)}
                  >
                    Refuser
                  </Bouton>
                </>
              )}
              {lien === 'ami' && (
                <Bouton ton="danger" chargement={occupe} onClick={() => agir(p.id, retirerAmi)}>
                  Retirer des amis
                </Bouton>
              )}
            </div>
          </div>

          {erreur && <Message>{erreur}</Message>}
          {p.bio && <p className="whitespace-pre-line text-zinc-300">{p.bio}</p>}
          <p className="text-sm text-zinc-400">
            Temps de jeu :{' '}
            <span className="text-zinc-200">{formaterDuree(p.timeSpentMinutes)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
