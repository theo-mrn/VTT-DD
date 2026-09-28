'use client';

import { ArrowLeft, Crown, Eye, MessageSquareLock, UserRound, Users } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { EtatVide, Page, TitreSection } from '@/components/commun/page';
import { Illustration } from '@/components/commun/illustration';
import { AvatarJoueur } from '@/components/compte/elements';
import { FichePersonnage } from '@/components/fiche/fiche-personnage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import type { Membre } from '@/lib/campagnes';
import { usePersonnagesCampagne, type Personnage } from '@/lib/personnages';
import { useCampaignPresence } from '@/lib/realtime';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useTable } from '../contexte';
import { jaugeDeResume, MiniJauge } from '../jauges';
import { PanelLink } from '../panels/navigation';
import { TABLE_PARAMS } from '../panels/registry';

const ORDRE_ROLE: Record<Membre['role'], number> = { gm: 0, player: 1, spectator: 2 };

/** Panneau Joueurs : la table, ou la fiche d'un joueur ouverte depuis elle (`?personnage=`). */
export function PanneauJoueurs() {
  const personnage = useSearchParams().get(TABLE_PARAMS.character);
  return personnage ? <FicheJoueur id={personnage} /> : <OngletJoueurs />;
}

/**
 * Joueurs : les membres de la table (présence en direct) et leurs personnages
 * joueurs, avec portrait, résumé et ressources du résumé calculé par le
 * service. Un clic ouvre la fiche (en lecture, ou modifiable selon les droits).
 */
export function OngletJoueurs() {
  const { campagne } = useTable();
  const moi = useProfil().id;
  const personnages = usePersonnagesCampagne(campagne.id);
  const presence = useCampaignPresence(campagne.id);
  const enLigne = useMemo(
    () => new Set(presence.users.filter((u) => u.connections > 0).map((u) => u.userId)),
    [presence.users],
  );
  const membres = useMemo(
    () => [...campagne.members].sort((a, b) => ORDRE_ROLE[a.role] - ORDRE_ROLE[b.role]),
    [campagne.members],
  );
  // Le seul personnage actif de chaque membre : celui qu'il incarne
  const persosDe = (m: Membre): Personnage[] =>
    (personnages.data ?? []).filter((p) => p.id === m.characterId);

  return (
    <Page large>
      <TitreSection compte={membres.length}>
        <Users className="size-4 text-primary" aria-hidden />
        Autour de la table
        {presence.live && (
          <span className="text-xs font-normal text-subtle">{enLigne.size} en ligne</span>
        )}
      </TitreSection>

      {personnages.isError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <span>Personnages indisponibles : {messageErreur(personnages.error)}</span>
        </div>
      )}

      <ul className="space-y-4">
        {membres.map((m) => {
          const persos = persosDe(m);
          return (
            <li
              key={m.userId}
              className={cn(
                'rounded-2xl border bg-card p-4 shadow-surface sm:p-5',
                m.userId === moi ? 'border-primary/40' : 'border-border',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="relative">
                  <AvatarJoueur nom={m.name} url={m.avatarUrl} taille="md" />
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card',
                      enLigne.has(m.userId) ? 'bg-success' : 'bg-surface-3',
                    )}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {m.role === 'gm' && <Crown className="size-3.5 shrink-0 text-primary" />}
                    <span className="truncate">{m.name}</span>
                    {m.userId === moi && (
                      <span className="text-xs font-normal text-subtle">· vous</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.role === 'gm'
                      ? 'Maître du jeu'
                      : m.role === 'spectator'
                        ? 'Spectateur'
                        : 'Joueur'}
                    {' · '}
                    {enLigne.has(m.userId) ? (
                      <span className="text-success">en ligne</span>
                    ) : (
                      'hors ligne'
                    )}
                  </p>
                </div>
                {m.userId !== moi && (
                  <Info texte={`Chuchoter à ${m.name}`}>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <PanelLink
                        panel="chat"
                        params={{ [TABLE_PARAMS.whisper]: m.userId }}
                        aria-label={`Chuchoter à ${m.name}`}
                      >
                        <MessageSquareLock />
                      </PanelLink>
                    </Button>
                  </Info>
                )}
              </div>

              {personnages.isLoading ? (
                <Skeleton className="mt-4 h-24 rounded-xl" />
              ) : persos.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {persos.map((p) => (
                    <CarteHeros key={p.id} personnage={p} />
                  ))}
                </div>
              ) : m.role === 'player' ? (
                <p className="mt-3 text-xs text-subtle">Pas encore de héros choisi.</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

function CarteHeros({ personnage: p }: { personnage: Personnage }) {
  const jauges = p.summary.highlights
    .map((h) => ({ label: h.label, jauge: jaugeDeResume(h.value) }))
    .filter((h) => h.jauge !== null);
  const badges = p.summary.highlights.filter((h) => !jaugeDeResume(h.value));
  return (
    <PanelLink
      panel="joueurs"
      params={{ [TABLE_PARAMS.character]: p.id }}
      className="group flex gap-3 rounded-xl border border-border bg-surface-2/50 p-3 transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <Illustration
        src={p.portraitUrl}
        graine={p.name}
        position="top"
        className="aspect-[3/4] w-16 shrink-0 rounded-lg ring-1 ring-border"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="flex items-center gap-2 truncate text-sm font-semibold group-hover:text-primary-strong">
            <span className="truncate">{p.name}</span>
            {p.inCreation && <Badge ton="alerte">En création</Badge>}
          </p>
          {p.summary.tagline && (
            <p className="truncate text-xs text-muted-foreground">{p.summary.tagline}</p>
          )}
        </div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.slice(0, 3).map((h) => (
              <span
                key={h.label}
                className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {h.label} <span className="text-foreground">{h.value}</span>
              </span>
            ))}
          </div>
        )}
        {jauges.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {jauges.slice(0, 4).map((h) => (
              <MiniJauge
                key={h.label}
                libelle={h.label}
                valeur={h.jauge!.valeur}
                max={h.jauge!.max}
              />
            ))}
          </div>
        )}
      </div>
    </PanelLink>
  );
}

/** Fiche d'un personnage de la table, ouverte depuis « Joueurs ». */
export function FicheJoueur({ id }: { id: string }) {
  const { campagne } = useTable();
  const personnages = usePersonnagesCampagne(campagne.id);
  const aLaTable = personnages.data?.some((p) => p.id === id);

  const retour = (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <Button variant="ghost" size="sm" asChild>
        <PanelLink panel="joueurs" params={{ [TABLE_PARAMS.character]: null }}>
          <ArrowLeft />
          Joueurs
        </PanelLink>
      </Button>
    </div>
  );

  if (personnages.isLoading)
    return (
      <>
        {retour}
        <Page large>
          <Skeleton className="h-64 rounded-2xl" />
        </Page>
      </>
    );
  if (personnages.isError)
    return (
      <>
        {retour}
        <Page>
          <EtatVide
            icone={UserRound}
            titre="Personnages indisponibles"
            description={messageErreur(personnages.error)}
          />
        </Page>
      </>
    );
  // Seuls les personnages joueurs de cette table s'ouvrent ici
  if (!aLaTable)
    return (
      <>
        {retour}
        <Page>
          <EtatVide
            icone={Eye}
            titre="Personnage absent de la table"
            description="Il a peut-être quitté la campagne."
          />
        </Page>
      </>
    );
  return (
    <>
      {retour}
      <FichePersonnage id={id} dansPanneau />
    </>
  );
}
