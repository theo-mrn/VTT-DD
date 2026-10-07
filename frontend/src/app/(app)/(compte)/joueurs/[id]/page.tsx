'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AvatarJoueur, Bouton, Carte, Chargement, Message } from '@/components/compte/elements';
import { styleLien } from '@/components/compte/styles';
import { LevelBadge } from '@/components/progression/level';
import { useDates } from '@/i18n/dates';
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
  const t = useTranslations('account');
  const dates = useDates();
  const { id } = useParams<{ id: string }>();
  const moi = useProfil();
  const joueur = useRessource(id ? `joueur-${id}` : null, () => lireJoueur(id));
  const { relation, agir, enCours, erreur } = useRelations(moi.id);

  if (joueur.chargement && !joueur.donnees) return <Chargement />;
  if (joueur.erreur || !joueur.donnees) {
    return (
      <Carte>
        <Message>{joueur.erreur ?? t('player.notFound')}</Message>
        <Link href="/amis" className={cn('mt-4 inline-block', styleLien)}>
          {t('player.backToFriends')}
        </Link>
      </Carte>
    );
  }

  const p = joueur.donnees;
  const lien = relation(p.id);
  const occupe = enCours === p.id;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface-2">
        <div
          className="h-36 bg-surface-3 bg-cover bg-center sm:h-44"
          style={p.bannerUrl ? { backgroundImage: `url(${p.bannerUrl})` } : undefined}
        />
        <div className="space-y-4 p-6">
          <div className="-mt-16 flex flex-wrap items-end gap-4">
            <AvatarJoueur nom={p.name} url={p.avatarUrl} bordure={p.borderType} taille="xl" />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2.5">
                <h1 className="truncate font-display text-2xl font-semibold text-foreground sm:text-3xl">
                  {p.name}
                </h1>
                <LevelBadge level={p.level ?? 1} className="shrink-0" />
              </div>
              {p.title && <p className="text-primary">{p.title}</p>}
            </div>
            <div className="flex gap-2">
              {lien === 'moi' && (
                <Bouton asChild ton="secondaire">
                  <Link href="/profil">{t('player.editProfile')}</Link>
                </Bouton>
              )}
              {lien === 'aucune' && (
                <Bouton chargement={occupe} onClick={() => agir(p.id, demanderEnAmi)}>
                  {t('player.addFriend')}
                </Bouton>
              )}
              {lien === 'envoyee' && (
                <Bouton
                  ton="secondaire"
                  chargement={occupe}
                  onClick={() => agir(p.id, supprimerDemande)}
                >
                  {t('player.cancelRequest')}
                </Bouton>
              )}
              {lien === 'recue' && (
                <>
                  <Bouton chargement={occupe} onClick={() => agir(p.id, accepterDemande)}>
                    {t('friends.accept')}
                  </Bouton>
                  <Bouton
                    ton="secondaire"
                    disabled={occupe}
                    onClick={() => agir(p.id, supprimerDemande)}
                  >
                    {t('friends.decline')}
                  </Bouton>
                </>
              )}
              {lien === 'ami' && (
                <Bouton ton="danger" chargement={occupe} onClick={() => agir(p.id, retirerAmi)}>
                  {t('player.removeFriend')}
                </Bouton>
              )}
            </div>
          </div>

          {erreur && <Message>{erreur}</Message>}
          {p.bio && <p className="whitespace-pre-line text-foreground/85">{p.bio}</p>}
          <p className="text-sm text-muted-foreground">
            {t.rich('player.playTime', {
              duration: dates.duration(p.timeSpentMinutes),
              b: (chunks) => <span className="text-foreground">{chunks}</span>,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
