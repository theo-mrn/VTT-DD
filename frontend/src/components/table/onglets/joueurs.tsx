'use client';

/**
 * Personnages de la table : un onglet par personnage joueur de la campagne, incarné ou non
 * (le joueur qui l'incarne, sinon « Non incarné »), et sa fiche juste en dessous. Un clic passe d'une fiche à l'autre, sans
 * retour ; le personnage choisi est dans l'adresse (`?personnage=`), partageable. On arrive
 * sur le sien, sinon sur le premier. « Importer une fiche » ouvre l'import dans un panneau,
 * sans quitter la table (docs/import-fiche.md) ; le personnage importé s'ouvre ensuite ici.
 */
import { compareText } from '@/i18n/runtime';
import { FileInput, MessageSquareLock, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { EtatVide, Page } from '@/components/commun/page';
import { Illustration } from '@/components/commun/illustration';
import { ImportFicheForm } from '@/components/creation/import-fiche';
import { FichePersonnage } from '@/components/fiche/fiche-personnage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import type { Membre } from '@/lib/campagnes';
import { usePersonnagesCampagne, type Personnage } from '@/lib/personnages';
import { useCampaignPresence } from '@/lib/realtime';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';
import { useTable } from '../contexte';
import { PanelLink, usePanels } from '../panels/navigation';
import { TABLE_PARAMS } from '../panels/registry';

interface Present {
  personnage: Personnage;
  /** Membre qui l'incarne, ou null. */
  joueur: Membre | null;
}

export function PanneauJoueurs() {
  const t = useTranslations('table.characters');
  const { campagne, gm } = useTable();
  const moi = useProfil().id;
  const { open } = usePanels();
  const [importer, setImporter] = useState(false);
  // Comme la création : le MJ, ou les joueurs si la campagne la leur ouvre
  const peutImporter = gm || (campagne.freeCreation && campagne.role !== 'spectator');
  const ti = useTranslations('creation.import');
  const boutonImport = peutImporter && (
    <Info texte={ti('entry')}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={ti('entry')}
        onClick={() => setImporter(true)}
      >
        <FileInput />
      </Button>
    </Info>
  );
  const panneauImport = peutImporter && (
    <Dialog open={importer} onOpenChange={setImporter}>
      <SheetContent cote="right" className="w-[94vw] max-w-2xl overflow-y-auto">
        <div className="space-y-6 px-6 py-6">
          <DialogTitle className="text-lg font-semibold">{ti('title')}</DialogTitle>
          <DialogDescription className="sr-only">{ti('title')}</DialogDescription>
          {importer && (
            <ImportFicheForm
              panel
              campagneId={campagne.id}
              incarner={!gm}
              onImported={(p) => {
                setImporter(false);
                open('joueurs', { [TABLE_PARAMS.character]: p.id });
              }}
            />
          )}
        </div>
      </SheetContent>
    </Dialog>
  );
  const choisi = useSearchParams().get(TABLE_PARAMS.character);
  const personnages = usePersonnagesCampagne(campagne.id);
  const presence = useCampaignPresence(campagne.id);
  const enLigne = useMemo(
    () => new Set(presence.users.filter((u) => u.connections > 0).map((u) => u.userId)),
    [presence.users],
  );

  // Tous les personnages joueurs : le mien d'abord, puis ceux qui sont incarnés, puis les autres
  const presents = useMemo((): Present[] => {
    const joueurDe = new Map(
      campagne.members.filter((m) => m.characterId).map((m) => [m.characterId!, m]),
    );
    const rang = (x: Present) => {
      if (x.joueur?.userId === moi) return 0;
      return x.joueur ? 1 : 2;
    };
    return (personnages.data ?? [])
      .map((p) => ({ personnage: p, joueur: joueurDe.get(p.id) ?? null }))
      .sort((a, b) => rang(a) - rang(b) || compareText(a.personnage.name, b.personnage.name));
  }, [campagne.members, personnages.data, moi]);

  const actif = presents.find((p) => p.personnage.id === choisi) ?? presents[0] ?? null;

  if (personnages.isLoading)
    return (
      <Page large>
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="mt-4 h-64 rounded-2xl" />
      </Page>
    );
  if (personnages.isError)
    return (
      <Page>
        <EtatVide
          icone={UserRound}
          titre={t('unavailable')}
          description={messageErreur(personnages.error)}
        />
      </Page>
    );
  if (!actif)
    return (
      <Page>
        <EtatVide
          icone={UserRound}
          titre={t('none')}
          description={t('noneText')}
          action={
            peutImporter ? (
              <Button variant="secondary" onClick={() => setImporter(true)}>
                <FileInput />
                {ti('entry')}
              </Button>
            ) : undefined
          }
        />
        {panneauImport}
      </Page>
    );

  return (
    <div className="flex min-h-full flex-col">
      {/* Onglets des personnages : collés en haut du panneau pendant le défilement de la fiche */}
      <nav
        aria-label={t('nav')}
        className="sticky top-14 z-20 border-b border-border bg-background/95"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 sm:px-6 lg:px-8">
          <ul className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {presents.map(({ personnage: p, joueur: j }) => {
              const courant = p.id === actif.personnage.id;
              return (
                <li key={p.id} className="shrink-0">
                  <PanelLink
                    panel="joueurs"
                    params={{ [TABLE_PARAMS.character]: p.id }}
                    aria-current={courant ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border py-1.5 pl-1.5 pr-3 transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      courant
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-transparent hover:border-border hover:bg-surface-2',
                    )}
                  >
                    <span className="relative">
                      <Illustration
                        largeur={36}
                        src={p.portraitUrl}
                        graine={p.name}
                        position="top"
                        className="size-9 rounded-lg ring-1 ring-border"
                      />
                      {j && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background',
                            enLigne.has(j.userId) ? 'bg-success' : 'bg-surface-3',
                          )}
                        />
                      )}
                    </span>
                    <span className="min-w-0 text-left">
                      <span
                        className={cn(
                          'block max-w-40 truncate text-sm font-semibold',
                          courant && 'text-primary-strong',
                        )}
                      >
                        {p.name}
                      </span>
                      <span className="block max-w-40 truncate text-[11px] text-muted-foreground">
                        {j ? nomJoueur(j, moi, enLigne.has(j.userId), t) : t('notPlayed')}
                      </span>
                    </span>
                  </PanelLink>
                </li>
              );
            })}
          </ul>
          {boutonImport}
          {actif.joueur && actif.joueur.userId !== moi && (
            <Info texte={t('whisper', { name: actif.joueur.name })}>
              <Button variant="ghost" size="icon-sm" asChild>
                <PanelLink
                  panel="chat"
                  params={{ [TABLE_PARAMS.whisper]: actif.joueur.userId }}
                  aria-label={t('whisper', { name: actif.joueur.name })}
                >
                  <MessageSquareLock />
                </PanelLink>
              </Button>
            </Info>
          )}
        </div>
      </nav>

      <FichePersonnage key={actif.personnage.id} id={actif.personnage.id} dansPanneau />
      {panneauImport}
    </div>
  );
}

function nomJoueur(
  j: { userId: string; name: string },
  moi: string,
  enLigne: boolean,
  t: ReturnType<typeof useTranslations<'table.characters'>>,
): string {
  const nom = j.userId === moi ? t('you') : j.name;
  return enLigne ? nom : t('offline', { name: nom });
}
