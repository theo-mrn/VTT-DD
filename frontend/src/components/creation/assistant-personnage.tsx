'use client';

import { useTranslations } from 'next-intl';
import { translate } from '@/i18n/runtime';
import {
  calculer,
  creationDe,
  etapesCreation,
  type EtapeCreation,
  type EtatEntite,
  type Fiche,
  type Presentation,
  type StatutEtape,
  type SystemeCharge,
} from '@vtt/rules';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  FileInput,
  Hammer,
  Lock,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EtatVide } from '@/components/commun/page';
import { Chargement, Message } from '@/components/compte/elements';
import { EnTeteFocus, ProgressionEtapes } from '@/components/shell/cadre-focus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { useCampagne } from '@/lib/campagnes';
import { etatInitial } from '@/lib/creation';
import {
  TYPE_HEROS,
  useCreerPersonnage,
  useOperationsPersonnage,
  usePersonnage,
  usePersonnagesCampagne,
  useSupprimerPersonnage,
  type DetailsPersonnage,
  type OperationCreation,
} from '@/lib/personnages';
import { useSynchroCampagne } from '@/lib/realtime-sync';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';
import { ApercuFiche } from './apercu-fiche';
import { EtapeAcheter } from './etape-acheter';
import { EtapeChoisir } from './etape-choisir';
import { EtapePortrait } from './etape-portrait';
import { EtapeRepartir, EtapeSaisir } from './etape-saisir';
import { EtapeTirer } from './etape-tirer';

type EtapeUI =
  | { id: 'identite' | 'portrait' | 'recap'; nom: string }
  | { id: string; nom: string; regle: EtapeCreation };

const DETAILS_VIDES: DetailsPersonnage = { concept: '', appearance: '', backstory: '' };

/** Adresse absolue d'une image (le service n'accepte que des URL http(s) complètes). */
function adresseAbsolue(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return null;
  }
}

/**
 * Assistant de création de personnage, généré depuis les étapes déclarées par
 * le système (`creation`) : aucune règle de jeu ici.
 *
 * Le héros naît dans le service character dès l'identité validée : il est
 * engagé dans la campagne et incarné, en création. Chaque étape est ensuite
 * enregistrée par le service (choix, répartitions, achats ; les dés sont tirés
 * par le serveur), qui fait autorité ; le moteur local n'affiche qu'un aperçu
 * immédiat. Quitter l'assistant garde le héros en création : on le reprend
 * depuis « Qui joue ? » ou par `?personnage=`.
 */
export function AssistantPersonnage({
  campagneId,
  personnageId = null,
}: Readonly<{
  campagneId: string;
  personnageId?: string | null;
}>) {
  const t = useTranslations();
  const router = useRouter();
  const profil = useProfil();
  const campagne = useCampagne(campagneId);
  const engages = usePersonnagesCampagne(campagneId);
  const creer = useCreerPersonnage();
  const supprimer = useSupprimerPersonnage();

  // Personnage en création dans le service (null tant que l'identité n'est pas validée)
  const [id, setId] = useState<string | null>(personnageId);
  const perso = usePersonnage(id);
  const ops = useOperationsPersonnage(id ?? '');
  // Réglages de la campagne (création permise…) et fiche suivis en direct
  useSynchroCampagne(campagneId, { personnage: id });

  // Le système est celui de la campagne, avec ses règles optionnelles : jamais demandé au joueur
  const sys = useCampaignSystem(campagne.data?.system, campagneId);
  const systeme = sys.data?.systeme ?? null;
  const presentation = sys.data?.presentation ?? null;

  const [nom, setNom] = useState('');
  const [details, setDetails] = useState<DetailsPersonnage>(DETAILS_VIDES);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [courant, setCourant] = useState<string>('identite');
  const [sens, setSens] = useState(1);
  const [envoi, setEnvoi] = useState(false);
  const repris = useRef(false);

  // État enregistré par le service ; avant sa naissance, un état vierge pour l'aperçu
  const vierge = useMemo(() => (systeme ? etatInitial(systeme, TYPE_HEROS) : null), [systeme]);
  const etat: EtatEntite | null = perso.data?.state ?? (id ? null : vierge);

  const fiche = useMemo(() => (systeme && etat ? calculer(systeme, etat) : null), [systeme, etat]);
  const statuts = useMemo(
    () => (systeme && etat ? etapesCreation(systeme, etat) : []),
    [systeme, etat],
  );
  const statut = (etapeId: string) => statuts.find((s) => s.etape.id === etapeId);

  const etapes = etapesUI(systeme);
  const index = Math.max(
    0,
    etapes.findIndex((e) => e.id === courant),
  );
  const etape = etapes[index]!;
  const regle = 'regle' in etape ? etape.regle : null;

  // Reprise d'un héros en création : identité, portrait, et première étape à faire
  useEffect(() => {
    if (repris.current || !perso.data || !systeme) return;
    repris.current = true;
    const p = perso.data;
    if (!p.inCreation) {
      router.replace(`/personnages/${p.id}`);
      return;
    }
    setNom(p.name);
    setDetails(p.details);
    setPortraitUrl(p.portraitUrl);
    const aFaire = etapesCreation(systeme, p.state).find((s) => s.statut !== 'faite');
    setCourant(aFaire ? `regle:${aFaire.etape.id}` : 'portrait');
  }, [perso.data, systeme, router]);

  const valide = (e: EtapeUI): boolean => {
    if (e.id === 'identite') return nom.trim().length >= 2;
    if ('regle' in e) return statut(e.regle.id)?.statut === 'faite';
    return true;
  };
  const toutesValides = etapes.slice(0, -1).every(valide);

  function aller(i: number) {
    const cible = etapes[i];
    if (!cible) return;
    setSens(i > index ? 1 : -1);
    setCourant(cible.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Quitte l'identité : le héros naît dans le service (engagé et incarné dans
   * la campagne), ou son profil est mis à jour.
   */
  async function validerIdentite(): Promise<boolean> {
    if (!campagne.data) return false;
    setEnvoi(true);
    try {
      if (!id) {
        const p = await creer.mutateAsync({
          campagneId,
          systemId: campagne.data.system,
          name: nom,
          details,
        });
        repris.current = true;
        setId(p.id);
        // L'adresse permet de reprendre la création après un rechargement
        router.replace(
          `/personnages/nouveau?${new URLSearchParams({ campagne: campagneId, personnage: p.id })}`,
          { scroll: false },
        );
      } else if (
        perso.data &&
        (nom.trim() !== perso.data.name ||
          (Object.keys(details) as (keyof DetailsPersonnage)[]).some(
            (k) => details[k].trim() !== perso.data!.details[k],
          ))
      ) {
        await ops.profil({ name: nom, details });
      }
      return true;
    } catch (err) {
      toast.error(messageErreur(err));
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  async function validerPortrait(): Promise<boolean> {
    const url = adresseAbsolue(portraitUrl);
    if (!id || url === (perso.data?.portraitUrl ?? null)) return true;
    setEnvoi(true);
    try {
      await ops.profil({ portraitUrl: url });
      return true;
    } catch (err) {
      toast.error(messageErreur(err));
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  async function avancer(i: number) {
    if (i > index && etape.id === 'identite' && !(await validerIdentite())) return;
    if (i > index && etape.id === 'portrait' && !(await validerPortrait())) return;
    aller(i);
  }

  /** Écriture d'une étape : aperçu local tout de suite, puis réponse du service. */
  function enregistrer(apercu: EtatEntite, op: OperationCreation) {
    const envoiOp =
      op.type === 'rembourser'
        ? ops.rembourser(op.index, apercu)
        : ops.etape(op.etape, op.corps, apercu);
    void envoiOp.catch((err: unknown) => toast.error(messageErreur(err)));
  }

  async function tirer(etapeId: string, affectation?: Record<string, number>) {
    const r = await ops.etape(etapeId, affectation ? { affectation } : {});
    return r.tirage;
  }

  async function recommencer() {
    if (id) {
      try {
        await supprimer.mutateAsync(id);
      } catch (err) {
        toast.error(messageErreur(err));
        return;
      }
      setId(null);
      router.replace(`/personnages/nouveau?${new URLSearchParams({ campagne: campagneId })}`, {
        scroll: false,
      });
    }
    setNom('');
    setDetails(DETAILS_VIDES);
    setPortraitUrl(null);
    aller(0);
  }

  async function terminer() {
    if (!id || !(await validerPortrait())) return;
    setEnvoi(true);
    try {
      const p = await ops.terminer();
      toast.success(t('creation.ready', { name: p.name }));
      // Le héros est déjà incarné (création dans la campagne) : direction la table
      router.replace(`/campagnes/${campagneId}/table`);
    } catch (err) {
      toast.error(messageErreur(err));
      setEnvoi(false);
    }
  }

  if (campagne.isError || (id && perso.isError)) return <Introuvable campagne={campagne.isError} />;

  const quitter = `/campagnes/${campagneId}/personnage`;
  // Le MJ réserve la création des héros : le joueur engage un personnage terminé
  const creationFermee =
    !id && campagne.data && !campagne.data.freeCreation && campagne.data.role !== 'gm';
  // Héros déjà en création dans cette campagne (proposé avant d'en commencer un autre)
  const enCours = herosEnCours(engages.data, profil.id, id);

  return (
    <div className="flex min-h-dvh flex-col" data-ambiance={campagne.data?.ambiance}>
      <EnTeteFocus
        centre={
          <ProgressionEtapes
            etapes={etapes.map((e) => ({
              id: e.id,
              nom: e.nom,
              // Portrait et récapitulatif n'ont rien à valider : faits une fois dépassés
              faite: e.id === 'portrait' || e.id === 'recap' ? false : valide(e),
            }))}
            courante={index}
            onAller={(i) => (i <= index || etapes.slice(0, i).every(valide)) && void avancer(i)}
          />
        }
        quitter={{ href: quitter }}
      />

      <div className="relative flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-halo" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-12">
          <main className="min-w-0">
            <EnTeteEtape
              campagne={campagne.data?.name}
              etape={etape}
              description={regle?.description}
              recommencer={id ? () => void recommencer() : undefined}
              suppression={supprimer.isPending}
            />

            {creationFermee ? (
              <CreationFermee quitter={quitter} />
            ) : (
              <AnimatePresence mode="wait" custom={sens}>
                <motion.section
                  key={etape.id}
                  custom={sens}
                  initial={{ opacity: 0, x: sens * 28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: sens * -28 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {etape.id === 'identite' && (
                    <>
                      <HerosEnCours
                        enCours={enCours}
                        campagneId={campagneId}
                        onReprendre={(heros) => {
                          repris.current = false;
                          setId(heros);
                        }}
                      />
                      {!id && (
                        <Button asChild variant="outline" size="sm" className="mb-6">
                          <Link
                            href={`/personnages/nouveau?${new URLSearchParams({ campagne: campagneId, import: '' })}`}
                          >
                            <FileInput />
                            {t('creation.import.entry')}
                          </Link>
                        </Button>
                      )}
                      <Identite
                        nom={nom}
                        setNom={setNom}
                        details={details}
                        setDetails={setDetails}
                      />
                    </>
                  )}

                  {regle && (
                    <EtapeRegle
                      regle={regle}
                      systeme={systeme}
                      presentation={presentation}
                      etat={etat}
                      fiche={fiche}
                      statut={statut(regle.id)}
                      onEtat={enregistrer}
                      onTirer={(affectation) => tirer(regle.id, affectation)}
                    />
                  )}

                  {etape.id === 'portrait' && fiche && (
                    <EtapePortrait
                      fiche={fiche}
                      presentation={presentation}
                      portrait={portraitUrl}
                      onPortrait={setPortraitUrl}
                      nom={nom}
                      personnageId={id}
                    />
                  )}

                  {etape.id === 'recap' && fiche && (
                    <>
                      <Recapitulatif
                        statuts={statuts.map((s) => ({
                          nom: s.etape.nom,
                          statut: s.statut,
                          raisons: s.raisons,
                        }))}
                        identiteOk={nom.trim().length >= 2}
                        details={details}
                      />
                      {/* Sur petit écran, l'aperçu de la colonne de droite vient ici */}
                      <div className="mt-5 lg:hidden">
                        <ApercuFiche
                          fiche={fiche}
                          presentation={presentation}
                          nom={nom}
                          portraitUrl={portraitUrl}
                          complet
                        />
                      </div>
                    </>
                  )}
                </motion.section>
              </AnimatePresence>
            )}

            {!creationFermee && (
              <Navigation
                index={index}
                recap={etape.id === 'recap'}
                envoi={envoi}
                creable={toutesValides && Boolean(id)}
                continuable={valide(etape) && Boolean(campagne.data)}
                onRetour={() => aller(index - 1)}
                onTerminer={() => void terminer()}
                onContinuer={() => void avancer(index + 1)}
              />
            )}
          </main>

          <ApercuLateral
            fiche={fiche}
            presentation={presentation}
            nom={nom}
            portraitUrl={portraitUrl}
            statuts={statuts}
          />
        </div>
      </div>
    </div>
  );
}

type EtatEtapeCreation = ReturnType<typeof etapesCreation>[number];

/** Campagne ou héros introuvable. */
function Introuvable({ campagne }: Readonly<{ campagne: boolean }>) {
  const t = useTranslations();
  return (
    <div className="px-4 py-20">
      <EtatVide
        icone={AlertTriangle}
        titre={campagne ? t('characters.picker.notFound') : t('creation.heroNotFound')}
        description={campagne ? t('creation.cantCreate') : t('creation.heroDeleted')}
      />
    </div>
  );
}

/** Création réservée au MJ : retour au choix d'un héros terminé. */
export function CreationFermee({ quitter }: Readonly<{ quitter: string }>) {
  const t = useTranslations();
  return (
    <EtatVide
      icone={Lock}
      titre={t('creation.gmOnly')}
      description={t('creation.gmOnlyHint')}
      action={
        <Button asChild variant="secondary">
          <Link href={quitter}>{t('creation.backToChoice')}</Link>
        </Button>
      }
    />
  );
}

/** Héros déjà en création dans la campagne : reprendre le premier plutôt qu'en commencer un autre. */
function HerosEnCours({
  enCours,
  campagneId,
  onReprendre,
}: Readonly<{
  enCours: { id: string; name: string }[];
  campagneId: string;
  onReprendre(id: string): void;
}>) {
  const t = useTranslations();
  const premier = enCours[0];
  if (!premier) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4 sm:flex-row sm:items-center">
      <Hammer className="size-5 shrink-0 text-primary" />
      <p className="min-w-0 flex-1 text-sm">
        {enCours.length > 1
          ? t('creation.manyInProgress', { count: enCours.length })
          : t('creation.oneInProgress', { name: premier.name })}
      </p>
      <Button size="sm" variant="secondary" asChild>
        <Link
          href={`/personnages/nouveau?${new URLSearchParams({ campagne: campagneId, personnage: premier.id })}`}
          onClick={() => onReprendre(premier.id)}
        >
          Reprendre {premier.name}
        </Link>
      </Button>
    </div>
  );
}

/** Étape déclarée par le système : choisir, tirer, saisir, répartir ou acheter. */
function EtapeRegle({
  regle,
  systeme,
  presentation,
  etat,
  fiche,
  statut,
  onEtat,
  onTirer,
}: Readonly<{
  regle: EtapeCreation;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  etat: EtatEntite | null;
  fiche: Fiche | null;
  statut: EtatEtapeCreation | undefined;
  onEtat(apercu: EtatEntite, op: OperationCreation): void;
  onTirer: Parameters<typeof EtapeTirer>[0]['onTirer'];
}>) {
  const t = useTranslations();
  if (!systeme || !etat || !fiche) return <Chargement texte={t('creation.loadingRules')} />;
  return (
    <>
      {regle.type === 'choisir' && (
        <EtapeChoisir
          systeme={systeme}
          presentation={presentation}
          etat={etat}
          fiche={fiche}
          etape={regle}
          onEtat={onEtat}
        />
      )}
      {regle.type === 'tirer' && (
        <EtapeTirer etat={etat} fiche={fiche} etape={regle} onTirer={onTirer} />
      )}
      {regle.type === 'saisir' && (
        <EtapeSaisir systeme={systeme} etat={etat} fiche={fiche} etape={regle} onEtat={onEtat} />
      )}
      {regle.type === 'repartir' && (
        <EtapeRepartir
          systeme={systeme}
          etat={etat}
          fiche={fiche}
          etape={regle}
          statut={statut}
          onEtat={onEtat}
        />
      )}
      {regle.type === 'acheter' && (
        <EtapeAcheter systeme={systeme} etat={etat} fiche={fiche} etape={regle} onEtat={onEtat} />
      )}
      <RaisonsEtape statut={statut} />
    </>
  );
}

/** Retour, puis Continuer, ou Créer le personnage au récapitulatif. */
function Navigation({
  index,
  recap,
  envoi,
  creable,
  continuable,
  onRetour,
  onTerminer,
  onContinuer,
}: Readonly<{
  index: number;
  recap: boolean;
  envoi: boolean;
  creable: boolean;
  continuable: boolean;
  onRetour(): void;
  onTerminer(): void;
  onContinuer(): void;
}>) {
  const t = useTranslations();
  return (
    <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
      <Button variant="ghost" onClick={onRetour} className={cn(index === 0 && 'invisible')}>
        <ArrowLeft />
        {t('common.actions.back')}
      </Button>
      {recap ? (
        <Button size="lg" onClick={onTerminer} loading={envoi} disabled={!creable}>
          <Check />
          {t('creation.create')}
        </Button>
      ) : (
        <Button size="lg" onClick={onContinuer} loading={envoi} disabled={!continuable}>
          {t('common.actions.continue')}
          <ArrowRight />
        </Button>
      )}
    </div>
  );
}

/** Colonne de droite : aperçu de la fiche et avancement des étapes. */
function ApercuLateral({
  fiche,
  presentation,
  nom,
  portraitUrl,
  statuts,
}: Readonly<{
  fiche: Fiche | null;
  presentation: Presentation | null;
  nom: string;
  portraitUrl: string | null;
  statuts: EtatEtapeCreation[];
}>) {
  const t = useTranslations();
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 space-y-4">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">
          {t('creation.yourHero')}
        </p>
        {fiche ? (
          <ApercuFiche
            fiche={fiche}
            presentation={presentation}
            nom={nom}
            portraitUrl={portraitUrl}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-subtle">
            {t('creation.loadingCampaignRules')}
          </div>
        )}
        {statuts.length > 0 && (
          <ul className="space-y-1.5 rounded-2xl border border-border bg-card p-4 text-[13px] shadow-surface">
            {statuts.map((s) => (
              <li key={s.etape.id} className="flex items-center gap-2.5">
                <PastilleStatut statut={s.statut} />
                <span
                  className={s.statut === 'faite' ? 'text-foreground' : 'text-muted-foreground'}
                >
                  {s.etape.nom}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/** Héros du joueur en création dans la campagne ; aucun une fois le sien commencé. */
function herosEnCours(
  engages: ReturnType<typeof usePersonnagesCampagne>['data'],
  joueur: string | undefined,
  id: string | null,
) {
  if (id) return [];
  return (engages ?? []).filter((p) => p.ownerId === joueur && p.inCreation);
}

/** Étapes de l'assistant : identité, celles du système, portrait, récapitulatif. */
function etapesUI(systeme: SystemeCharge | null): EtapeUI[] {
  const regles = systeme ? (creationDe(systeme, TYPE_HEROS)?.etapes ?? []) : [];
  return [
    { id: 'identite' as const, nom: translate('creation.steps.identity') },
    ...regles.map((r) => ({ id: `regle:${r.id}`, nom: r.nom, regle: r })),
    { id: 'portrait' as const, nom: translate('creation.steps.portrait') },
    { id: 'recap' as const, nom: translate('creation.steps.recap') },
  ];
}

/** Titre de l'étape, sa description, et « Recommencer » une fois le héros créé. */
function EnTeteEtape({
  campagne,
  etape,
  description,
  recommencer,
  suppression,
}: Readonly<{
  campagne: string | undefined;
  etape: EtapeUI;
  description: string | undefined;
  /** Absent tant que le héros n'existe pas dans le service. */
  recommencer: (() => void) | undefined;
  suppression: boolean;
}>) {
  const t = useTranslations();
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
          Nouveau héros{campagne !== undefined ? ` · ${campagne}` : ''}
        </p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">{titreEtape(etape)}</h1>
        {description && (
          <p className="max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {recommencer && (
        <Button
          variant="ghost"
          size="sm"
          onClick={recommencer}
          loading={suppression}
          className="shrink-0"
        >
          {!suppression && <RotateCcw />}
          <span className="hidden sm:inline">{t('creation.restart')}</span>
        </Button>
      )}
    </div>
  );
}

function titreEtape(e: EtapeUI): string {
  switch (e.id) {
    case 'identite':
      return translate('creation.titles.identity');
    case 'portrait':
      return translate('creation.titles.portrait');
    case 'recap':
      return translate('creation.titles.recap');
    default:
      return e.nom;
  }
}

function PastilleStatut({ statut }: Readonly<{ statut: StatutEtape }>) {
  if (statut === 'faite')
    return (
      <span className="flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-2.5" strokeWidth={3} />
      </span>
    );
  if (statut === 'invalide') return <AlertTriangle className="size-4 text-destructive" />;
  return <Circle className="size-4 text-subtle" />;
}

function RaisonsEtape({
  statut,
}: Readonly<{
  statut: { statut: StatutEtape; raisons: string[] } | undefined;
}>) {
  if (!statut || statut.statut === 'faite' || statut.raisons.length === 0) return null;
  return (
    <div className="mt-6">
      <Message ton={statut.statut === 'invalide' ? 'erreur' : 'info'}>
        {statut.raisons.join(' · ')}
      </Message>
    </div>
  );
}

function Identite({
  nom,
  setNom,
  details,
  setDetails,
}: Readonly<{
  nom: string;
  setNom: (v: string) => void;
  details: DetailsPersonnage;
  setDetails: (d: DetailsPersonnage) => void;
}>) {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="p-nom">{t('map.lights.name')}</Label>
        <Input
          id="p-nom"
          autoFocus
          maxLength={60}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder={t('creation.namePlaceholder')}
          className="h-12 font-display text-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-concept">{t('sheet.page.concept')}</Label>
        <Input
          id="p-concept"
          maxLength={120}
          value={details.concept}
          onChange={(e) => setDetails({ ...details, concept: e.target.value })}
          placeholder={t('creation.conceptPlaceholder')}
        />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="p-apparence">{t('sheet.page.appearance')}</Label>
          <Textarea
            id="p-apparence"
            maxLength={2000}
            value={details.appearance}
            onChange={(e) => setDetails({ ...details, appearance: e.target.value })}
            placeholder={t('creation.appearancePlaceholder')}
            className="min-h-[140px]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-histoire">{t('sheet.page.story')}</Label>
          <Textarea
            id="p-histoire"
            maxLength={8000}
            value={details.backstory}
            onChange={(e) => setDetails({ ...details, backstory: e.target.value })}
            placeholder={t('creation.storyPlaceholder')}
            className="min-h-[140px]"
          />
        </div>
      </div>
      <p className="text-xs text-subtle">
        Seul le nom est requis ; le reste peut attendre. Votre héros est enregistré dès cette étape
        : vous pourrez reprendre sa création plus tard.
      </p>
    </div>
  );
}

function Recapitulatif({
  statuts,
  identiteOk,
  details,
}: Readonly<{
  statuts: { nom: string; statut: StatutEtape; raisons: string[] }[];
  identiteOk: boolean;
  details: DetailsPersonnage;
}>) {
  const t = useTranslations();
  const restantes = statuts.filter((s) => s.statut !== 'faite');
  return (
    <div className="space-y-5">
      {restantes.length > 0 || !identiteOk ? (
        <Message>
          Il reste à faire :{' '}
          {[
            ...(identiteOk ? [] : [t('map.lights.name')]),
            ...restantes.flatMap((s) => s.raisons),
          ].join(' · ')}
        </Message>
      ) : (
        <Message ton="succes">{t('creation.allGood')}</Message>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {statuts.map((s) => (
          <li
            key={s.nom}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm"
          >
            <PastilleStatut statut={s.statut} />
            {s.nom}
          </li>
        ))}
      </ul>
      {(details.concept || details.appearance || details.backstory) && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 text-sm shadow-surface">
          {details.concept && <p className="font-medium">{details.concept}</p>}
          {details.appearance && (
            <p className="whitespace-pre-line text-muted-foreground">{details.appearance}</p>
          )}
          {details.backstory && (
            <p className="whitespace-pre-line text-muted-foreground">{details.backstory}</p>
          )}
        </div>
      )}
    </div>
  );
}
