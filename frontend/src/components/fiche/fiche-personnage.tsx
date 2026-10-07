'use client';

import { useTranslations } from 'next-intl';
import {
  BedDouble,
  Crop,
  Hammer,
  LayoutGrid,
  SlidersHorizontal,
  TrendingUp,
  MoreHorizontal,
  Pencil,
  Swords,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PERIODES_REPOS, recuperer, remettreUsages } from '@vtt/rules';
import { useDemandeJet } from '@/components/des/demande-jet';
import { useTableOptionnelle } from '@/components/table/contexte';
import { usePanelStoreApiOptionnel } from '@/components/table/panels/store';
import { useNomSysteme } from '@/components/campagnes/carte-campagne';
import { Illustration } from '@/components/commun/illustration';
import { EtatVide, Page } from '@/components/commun/page';
import { Chargement, Message } from '@/components/compte/elements';
import { useDates } from '@/i18n/dates';
import { PortraitStudio } from '@/components/portraits/portrait-studio';
import { SheetGrid } from '@/components/sheet-grid/sheet-grid';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useCampagne } from '@/lib/campagnes';
import {
  lienPersonnage,
  useModifierPersonnage,
  useOperationsPersonnage,
  usePersonnage,
  useSupprimerPersonnage,
  type FichePersonnage as Fiche,
  type SheetLayout,
} from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { calculerMemo } from '@/lib/rules-cache';
import { useProfil } from '@/lib/session';
import { undoAction } from '@/lib/trash';
import { cn } from '@/lib/utils';
import { BannerIdentity, BannerStats } from './banner';
import { styleThemeSysteme } from './theme';
import { actionsProgression, ProgressionDialog } from './progression-dialog';
import { ValuesDialog } from './values-dialog';
import { widgetsDe, type ContexteFiche, type OperationsFiche } from './widgets';

/**
 * Fiche calculée d'un personnage et ses écritures : état lu dans character,
 * calculé par @vtt/rules avec son système et les règles optionnelles de sa
 * campagne, tenu à jour en direct dans sa campagne. Le propriétaire et le MJ de sa campagne la modifient ; les autres
 * la lisent (`ctx.operations` absent).
 */
export function useFicheCalculee(id: string | null | undefined) {
  const profil = useProfil();
  const perso = usePersonnage(id);
  // Règles du système, réglées avec les options de sa campagne (encombrement…)
  const sys = useCampaignSystem(perso.data?.system.id, perso.data?.roomId);
  const campagne = useCampagne(perso.data?.roomId);
  const ecritures = useOperationsPersonnage(id ?? '');
  // Le MJ modifie la fiche (ou le joueur, vu du MJ) : elle change en direct
  useSynchroCampagne(perso.data?.roomId, { personnage: id ?? null });
  const fiche = useMemo(
    () => (sys.data && perso.data ? calculerMemo(sys.data.systeme, perso.data.state) : null),
    [sys.data, perso.data],
  );
  const operations = useMemo<OperationsFiche>(() => {
    const signaler = (e: unknown) => toast.error(messageErreur(e));
    return {
      valeurs: (v, apercu) => void ecritures.valeurs(v, apercu).catch(signaler),
      acheter: (achat, objet, apercu) =>
        void ecritures.acheter(achat, objet, apercu).catch(signaler),
      possession: (d, apercu) => void ecritures.possession(d, apercu).catch(signaler),
      retirerPossession: (entree, exemplaire, apercu) =>
        void ecritures.retirerPossession(entree, exemplaire, apercu).catch(signaler),
      donner: (d, apercu) =>
        ecritures.donner(d, apercu).then(
          () => true,
          (e: unknown) => {
            signaler(e);
            return false;
          },
        ),
      dossiers: (folders, apercu) => void ecritures.dossiers(folders, apercu).catch(signaler),
      bonus: (d, apercu) => void ecritures.bonus(d, apercu).catch(signaler),
      retirerBonus: (b, apercu) => void ecritures.retirerBonus(b, apercu).catch(signaler),
      effet: (cle, actif, apercu) => void ecritures.effet(cle, actif, apercu).catch(signaler),
      rembourser: (index, apercu) => void ecritures.rembourser(index, apercu).catch(signaler),
      usage: (entree, rendre, apercu) =>
        void ecritures.usage(entree, rendre, apercu).catch(signaler),
      repos: (apercu) => void ecritures.repos(apercu).catch(signaler),
      action: ecritures.action,
    };
  }, [ecritures]);

  const p = perso.data;
  // Suppression seulement : le reste suit `permissions` (pas de possession dans une campagne)
  const proprietaire = Boolean(p) && p!.ownerId === profil.id;
  // Droits décidés par le service : joueur qui l'incarne ou MJ d'une campagne où il est
  // engagé ; hors campagne et pendant la création, son propriétaire
  const permissions = p?.permissions ?? { write: false, layout: false };
  const peutModifier = permissions.write;
  const mj = campagne.data?.role === 'gm';
  // « Lancer » une capacité : à la table, sur la fiche de son héros (celui du panneau des dés)
  const table = useTableOptionnelle();
  const panneaux = usePanelStoreApiOptionnel();
  const demanderJet = useDemandeJet((s) => s.demander);
  const lancerJet = useMemo(
    () =>
      id && panneaux && table?.herosId === id
        ? (d: { bonus: string[]; attributs: string[] }) => {
            demanderJet({ personnageId: id, ...d });
            panneaux.getState().open('des');
          }
        : undefined,
    [id, panneaux, table?.herosId, demanderJet],
  );
  const ctx = useMemo<ContexteFiche | null>(
    () =>
      p && sys.data && fiche
        ? {
            systeme: sys.data.systeme,
            presentation: sys.data.presentation,
            fiche,
            personnage: { id: p.id, name: p.name, roomId: p.roomId, portraitUrl: p.portraitUrl },
            operations: peutModifier ? operations : undefined,
            mj,
            ...(lancerJet ? { lancerJet } : {}),
          }
        : null,
    [p, sys.data, fiche, peutModifier, operations, mj, lancerJet],
  );
  return { perso, sys, ctx, proprietaire, peutModifier, permissions, ecritures };
}

/**
 * Fiche d'un personnage : en-tête (portrait, nom, campagne, système, ressources) et grille
 * de blocs personnalisable (components/sheet-grid), aux couleurs de sa campagne ou de son
 * système. Les valeurs viennent de @vtt/rules ; les changements sont enregistrés par le
 * service character, qui décide des droits (`permissions`) : écrire sur la fiche, changer
 * sa mise en page. La même fiche s'affiche en page et dans les panneaux de la table.
 */
export function FichePersonnage({
  id,
  dansPanneau = false,
  valeursOuvertes = false,
}: Readonly<{
  id: string;
  /** Dans un panneau de la table : en-tête plus compact. */
  dansPanneau?: boolean;
  /** Ouverte sur ses valeurs (stats à modifier), depuis la carte. */
  valeursOuvertes?: boolean;
}>) {
  const t = useTranslations();
  const { perso, sys, ctx, proprietaire, peutModifier, permissions, ecritures } =
    useFicheCalculee(id);
  const campagne = useCampagne(perso.data?.roomId);
  const [personnalisation, setPersonnalisation] = useState(false);
  const enregistrerMiseEnPage = useCallback(
    (l: SheetLayout | null) => ecritures.miseEnPage(l),
    [ecritures],
  );
  // Droit retiré entre-temps (le personnage a quitté la campagne du MJ…) : fin de la personnalisation
  const edition = personnalisation && permissions.layout;

  if (perso.isLoading) return <SqueletteFiche dansPanneau={dansPanneau} />;
  if (perso.isError || !perso.data)
    return (
      <Page>
        <EtatVide
          icone={UserRound}
          titre={t('sheet.page.notFound')}
          description={t('sheet.page.notFoundHint')}
          action={
            <Button asChild variant="secondary">
              <Link href="/personnages">{t('sheet.page.allCharacters')}</Link>
            </Button>
          }
        />
      </Page>
    );

  const p = perso.data;

  return (
    <div
      data-ambiance={campagne.data?.ambiance}
      style={campagne.data ? undefined : styleThemeSysteme(sys.data?.presentation)}
    >
      <EnTeteFiche
        personnage={p}
        ctx={ctx}
        proprietaire={proprietaire}
        peutModifier={peutModifier}
        dansPanneau={dansPanneau}
        valeursOuvertes={valeursOuvertes}
        personnaliser={
          permissions.layout && ctx && !edition ? () => setPersonnalisation(true) : undefined
        }
      />
      <Page large className="pt-0 lg:pt-0">
        <Tabs defaultValue="fiche">
          <TabsList variante="ligne" className="mb-2">
            <TabsTrigger value="fiche">{t('sheet.page.sheet')}</TabsTrigger>
            <TabsTrigger value="histoire">{t('sheet.page.story')}</TabsTrigger>
          </TabsList>
          <TabsContent value="fiche">
            {sys.isError && <Message>{t('sheet.page.rulesFailed')}</Message>}
            {!ctx ? (
              !sys.isError && <Chargement texte={t('sheet.page.computing')} />
            ) : (
              <SheetGrid
                ctx={ctx}
                layout={p.sheetLayout}
                editing={edition}
                onEditingChange={setPersonnalisation}
                onSave={enregistrerMiseEnPage}
              />
            )}
          </TabsContent>
          <TabsContent value="histoire">
            <Histoire personnage={p} />
          </TabsContent>
        </Tabs>
      </Page>
    </div>
  );
}

/** Délai de l'animation de fermeture d'un dialogue, avant de le démonter. */
const FERMETURE_DIALOGUE_MS = 300;

/**
 * Dialogue monté à son ouverture et démonté après sa fermeture animée : fermé, il ne
 * recalcule rien à chaque écriture sur la fiche.
 */
function MonteSiOuvert({ open, children }: { open: boolean; children: ReactNode }) {
  const [garde, setGarde] = useState(open);
  useEffect(() => {
    if (open) {
      setGarde(true);
      return;
    }
    const t = setTimeout(() => setGarde(false), FERMETURE_DIALOGUE_MS);
    return () => clearTimeout(t);
  }, [open]);
  return open || garde ? children : null;
}

function EnTeteFiche({
  personnage: p,
  ctx,
  proprietaire,
  peutModifier,
  dansPanneau,
  valeursOuvertes,
  personnaliser,
}: Readonly<{
  personnage: Fiche;
  ctx: ContexteFiche | null;
  /** Propriétaire du personnage : lui seul le supprime. */
  proprietaire: boolean;
  /** Droit d'écrire sur la fiche (`permissions.write`) : identité comprise. */
  peutModifier: boolean;
  dansPanneau: boolean;
  /** Fenêtre des valeurs ouverte d'emblée. */
  valeursOuvertes: boolean;
  /** Présent si l'utilisateur peut changer la mise en page de la fiche. */
  personnaliser?: () => void;
}>) {
  const nomSysteme = useNomSysteme(p.system.id);
  const campagne = useCampagne(p.roomId);
  const [edition, setEdition] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const [valeurs, setValeurs] = useState(valeursOuvertes);
  const [progression, setProgression] = useState<string | null>(null);
  // Progression (passage de niveau) et valeurs : à qui peut écrire sur la fiche (joueur
  // qui l'incarne, MJ), comme toutes les écritures (`ctx.operations`)
  const progressions = useMemo(() => (ctx?.operations ? actionsProgression(ctx) : []), [ctx]);
  const peutValeurs = Boolean(ctx?.operations);
  // Repos complet : ressources à leur borne, utilisations des usages limités rendues
  const repos = useCallback(() => {
    if (!ctx?.operations?.repos) return;
    const recupere = recuperer(ctx.fiche);
    ctx.operations.repos(remettreUsages(ctx.systeme, recupere, PERIODES_REPOS) ?? recupere);
  }, [ctx]);
  const details = useMemo(
    () => (ctx ? widgetsDe(ctx).find((w) => w.type === 'details') : undefined),
    [ctx],
  );

  return (
    <section className="relative isolate overflow-hidden" data-ambiance={campagne.data?.ambiance}>
      <Illustration
        src={p.portraitUrl}
        graine={p.name}
        initiale={false}
        className="absolute inset-0 -z-10 opacity-50"
        floute
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/85 to-background"
      />
      <div
        className={cn(
          'mx-auto flex max-w-7xl gap-4 px-4 pb-6 sm:gap-6 sm:px-6 lg:px-8',
          dansPanneau ? 'pt-5 lg:pt-6' : 'pt-8 lg:pt-10',
        )}
      >
        <PortraitFiche personnage={p} peutModifier={peutModifier} dansPanneau={dansPanneau} />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              {/* Contexte en une ligne discrète : système, campagne */}
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{nomSysteme}</span>
                {campagne.data && (
                  <>
                    <span aria-hidden className="text-subtle">
                      ·
                    </span>
                    <Link
                      href={`/campagnes/${campagne.data.id}`}
                      className="inline-flex items-center gap-1 rounded text-primary-strong transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <Swords className="size-3" aria-hidden />
                      {campagne.data.name}
                    </Link>
                  </>
                )}
              </p>
              <h1
                className={cn(
                  'text-balance font-display font-semibold leading-tight',
                  dansPanneau ? 'text-3xl sm:text-4xl' : 'text-4xl sm:text-5xl',
                )}
              >
                {p.name}
              </h1>
              {ctx && details?.type === 'details' && <BannerIdentity ctx={ctx} widget={details} />}
              {p.details.concept && (
                <p className="max-w-2xl text-sm italic text-muted-foreground">
                  {p.details.concept}
                </p>
              )}
            </div>
            <MenuFiche
              personnage={p}
              proprietaire={proprietaire}
              peutModifier={peutModifier}
              progressions={progressions}
              onProgression={setProgression}
              onValeurs={peutValeurs ? () => setValeurs(true) : undefined}
              onRepos={ctx?.operations?.repos ? repos : undefined}
              onPersonnaliser={personnaliser}
              onModifier={() => setEdition(true)}
              onSupprimer={() => setSuppression(true)}
            />
          </div>
          {ctx ? (
            <BannerStats ctx={ctx} widget={details?.type === 'details' ? details : undefined} />
          ) : (
            // Fiche pas encore calculée : le résumé du service
            p.summary.highlights.length > 0 && (
              <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                {p.summary.highlights.map((h) => (
                  <span key={h.label}>
                    <span className="text-subtle">{h.label}</span> {h.value}
                  </span>
                ))}
              </p>
            )
          )}
        </div>
      </div>
      {ctx &&
        progressions.map((a) => (
          <MonteSiOuvert key={a.id} open={progression === a.id}>
            <ProgressionDialog
              ctx={ctx}
              action={a}
              open={progression === a.id}
              onOpenChange={(o) => setProgression(o ? a.id : null)}
            />
          </MonteSiOuvert>
        ))}
      {ctx && peutValeurs && (
        <MonteSiOuvert open={valeurs}>
          <ValuesDialog
            ctx={ctx}
            proprietaire={peutModifier}
            open={valeurs}
            onOpenChange={setValeurs}
          />
        </MonteSiOuvert>
      )}
      {peutModifier && <EditionIdentite personnage={p} ouvert={edition} onOuvert={setEdition} />}
      {proprietaire && (
        <DialogueSuppression personnage={p} ouvert={suppression} onOuvert={setSuppression} />
      )}
    </section>
  );
}

/**
 * Actions de la fiche dans un seul menu « … » : progression (passage de niveau), valeurs,
 * mise en page, identité (qui peut écrire sur la fiche) ; puis la date de modification et
 * la suppression (propriétaire).
 */
function MenuFiche({
  personnage: p,
  proprietaire,
  peutModifier,
  progressions,
  onProgression,
  onValeurs,
  onRepos,
  onPersonnaliser,
  onModifier,
  onSupprimer,
}: Readonly<{
  personnage: Fiche;
  proprietaire: boolean;
  peutModifier: boolean;
  progressions: { id: string; nom: string }[];
  onProgression: (id: string) => void;
  onValeurs?: () => void;
  onRepos?: () => void;
  onPersonnaliser?: () => void;
  onModifier: () => void;
  onSupprimer: () => void;
}>) {
  const t = useTranslations();
  const dates = useDates();
  const creation = proprietaire && p.inCreation && p.roomId;
  if (
    !progressions.length &&
    !onValeurs &&
    !onRepos &&
    !onPersonnaliser &&
    !peutModifier &&
    !proprietaire
  )
    return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon-sm" aria-label={t('sheet.page.actions')}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {creation && (
          <DropdownMenuItem asChild>
            <Link href={lienPersonnage(p)}>
              <Hammer />
              {t('characters.picker.resumeCreation')}
            </Link>
          </DropdownMenuItem>
        )}
        {progressions.map((a) => (
          <DropdownMenuItem key={a.id} onSelect={() => onProgression(a.id)}>
            <TrendingUp />
            {a.nom}
          </DropdownMenuItem>
        ))}
        {onValeurs && (
          <DropdownMenuItem onSelect={onValeurs}>
            <SlidersHorizontal />
            {t('sheet.page.values')}
          </DropdownMenuItem>
        )}
        {onRepos && (
          <DropdownMenuItem onSelect={onRepos}>
            <BedDouble />
            {t('sheet.page.rest')}
          </DropdownMenuItem>
        )}
        {onPersonnaliser && (
          <DropdownMenuItem onSelect={onPersonnaliser}>
            <LayoutGrid />
            {t('sheet.page.customize')}
          </DropdownMenuItem>
        )}
        {peutModifier && (
          <DropdownMenuItem onSelect={onModifier}>
            <Pencil />
            {t('sheet.page.editIdentity')}
          </DropdownMenuItem>
        )}
        {(peutModifier || proprietaire) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs">
              Modifié {dates.since(p.updatedAt)}
            </DropdownMenuItem>
          </>
        )}
        {proprietaire && (
          <DropdownMenuItem
            onSelect={onSupprimer}
            className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 />
            {t('common.actions.delete')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Histoire({ personnage: p }: Readonly<{ personnage: Fiche }>) {
  const t = useTranslations();
  const vide = !p.details.appearance && !p.details.backstory;
  if (vide)
    return <p className="py-12 text-center text-sm text-subtle">{t('sheet.page.noStory')}</p>;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {p.details.appearance && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-surface">
          <h2 className="mb-3 text-sm font-semibold">{t('sheet.page.appearance')}</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
            {p.details.appearance}
          </p>
        </section>
      )}
      {p.details.backstory && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-surface">
          <h2 className="mb-3 text-sm font-semibold">{t('sheet.page.story')}</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
            {p.details.backstory}
          </p>
        </section>
      )}
    </div>
  );
}

/** Portrait de l'en-tête ; un clic ouvre le Studio (cadrages, token) à qui peut modifier. */
function PortraitFiche({
  personnage: p,
  peutModifier,
  dansPanneau,
}: Readonly<{
  personnage: Fiche;
  peutModifier: boolean;
  dansPanneau: boolean;
}>) {
  const t = useTranslations();
  const modifier = useModifierPersonnage(p.id);
  const [studio, setStudio] = useState(false);
  const image = (
    <Illustration
      largeur={192}
      src={p.portraitUrl}
      graine={p.name}
      position="top"
      className="aspect-[3/4] size-full"
      classeImage="transition-transform duration-500 group-hover:scale-105"
    />
  );
  const taille = dansPanneau ? 'w-20 sm:w-28' : 'w-28 sm:w-36';
  const cadre =
    'shrink-0 self-start overflow-hidden rounded-xl shadow-elevated ring-1 ring-white/10';
  if (!peutModifier) return <div className={cn(cadre, taille)}>{image}</div>;
  return (
    <>
      <button
        type="button"
        onClick={() => setStudio(true)}
        aria-label={t('portraits.title')}
        className={cn(
          cadre,
          taille,
          'group relative transition-shadow hover:ring-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {image}
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-background/90 to-transparent pb-2 pt-6 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Crop className="size-3.5" aria-hidden />
          {t('sheet.page.studio')}
        </span>
      </button>
      <PortraitStudio
        open={studio}
        onOpenChange={setStudio}
        characterId={p.id}
        name={p.name}
        current={{ portraitUrl: p.portraitUrl, studio: p.portraitStudio }}
        onSave={async (r) => {
          await modifier.mutateAsync({
            portraitUrl: r.portraitUrl,
            tokenUrl: r.tokenUrl,
            portraitStudio: r.studio,
          });
        }}
      />
    </>
  );
}

function EditionIdentite({
  personnage: p,
  ouvert,
  onOuvert,
}: Readonly<{
  personnage: Fiche;
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
}>) {
  const t = useTranslations();
  const modifier = useModifierPersonnage(p.id);
  const [nom, setNom] = useState(p.name);
  const [portrait, setPortrait] = useState(p.portraitUrl ?? '');
  const [details, setDetails] = useState(p.details);

  // Repart de la fiche enregistrée à chaque ouverture (elle a pu changer entre-temps)
  useEffect(() => {
    if (!ouvert) return;
    setNom(p.name);
    setPortrait(p.portraitUrl ?? '');
    setDetails(p.details);
  }, [ouvert]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enregistrer() {
    try {
      await modifier.mutateAsync({
        name: nom.trim(),
        portraitUrl: portrait.trim() || null,
        details,
      });
      toast.success(t('sheet.page.updated'));
      onOuvert(false);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier {p.name}</DialogTitle>
          <DialogDescription>{t('sheet.page.identityHint')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="e-nom">{t('map.lights.name')}</Label>
              <Input
                id="e-nom"
                value={nom}
                maxLength={60}
                onChange={(e) => setNom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-portrait">Portrait (adresse https)</Label>
              <Input
                id="e-portrait"
                value={portrait}
                onChange={(e) => setPortrait(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-concept">{t('sheet.page.concept')}</Label>
            <Input
              id="e-concept"
              value={details.concept}
              maxLength={120}
              onChange={(e) => setDetails({ ...details, concept: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-apparence">{t('sheet.page.appearance')}</Label>
            <Textarea
              id="e-apparence"
              value={details.appearance}
              onChange={(e) => setDetails({ ...details, appearance: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-histoire">{t('sheet.page.story')}</Label>
            <Textarea
              id="e-histoire"
              value={details.backstory}
              onChange={(e) => setDetails({ ...details, backstory: e.target.value })}
              className="min-h-[140px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOuvert(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            onClick={() => void enregistrer()}
            loading={modifier.isPending}
            disabled={nom.trim().length < 2}
          >
            {t('common.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogueSuppression({
  personnage: p,
  ouvert,
  onOuvert,
}: Readonly<{
  personnage: Fiche;
  ouvert: boolean;
  onOuvert: (v: boolean) => void;
}>) {
  const t = useTranslations();
  const router = useRouter();
  const supprimer = useSupprimerPersonnage();
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState('');
  return (
    <Dialog open={ouvert} onOpenChange={onOuvert}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sheet.inventory.deleteTitle', { name: p.name })}</DialogTitle>
          <DialogDescription>{t('sheet.page.restorable')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground">
            {t.rich('sheet.page.typeToConfirm', {
              name: p.name,
              b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
            })}
          </p>
          <Input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoFocus />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOuvert(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={confirmation.trim() !== p.name}
            loading={supprimer.isPending}
            onClick={() =>
              supprimer.mutate(p.id, {
                onSuccess: () => {
                  toast.success(t('sheet.page.left', { name: p.name }), {
                    action: undoAction(client, { id: p.id, name: p.name }),
                  });
                  router.replace('/personnages');
                },
                onError: (e) => toast.error(messageErreur(e)),
              })
            }
          >
            {t('common.actions.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SqueletteFiche({ dansPanneau = false }: Readonly<{ dansPanneau?: boolean }>) {
  const t = useTranslations();
  return (
    <div
      className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-8"
      aria-busy
      aria-label={t('sheet.page.loading')}
    >
      <div className="flex items-end gap-6">
        <Skeleton className={cn('aspect-[3/4] rounded-2xl', dansPanneau ? 'w-32' : 'w-44')} />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-80 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
