'use client';

import {
  calculer,
  creationDe,
  etapesCreation,
  type EtapeCreation,
  type EtatEntite,
  type StatutEtape,
} from '@vtt/rules';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Hammer,
  Lock,
  RotateCcw,
  Sparkles,
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
import { useSysteme } from '@/lib/systemes';
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
}: {
  campagneId: string;
  personnageId?: string | null;
}) {
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

  // Le système est celui de la campagne : jamais demandé au joueur
  const sys = useSysteme(campagne.data?.system);
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

  const regles = systeme ? (creationDe(systeme, TYPE_HEROS)?.etapes ?? []) : [];
  const etapes: EtapeUI[] = [
    { id: 'identite' as const, nom: 'Identité' },
    ...regles.map((r) => ({ id: `regle:${r.id}`, nom: r.nom, regle: r })),
    { id: 'portrait' as const, nom: 'Portrait' },
    { id: 'recap' as const, nom: 'Récapitulatif' },
  ];
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
      toast.success(`${p.name} est prêt pour l'aventure !`);
      // Le héros est déjà incarné (création dans la campagne) : direction la table
      router.replace(`/campagnes/${campagneId}/table`);
    } catch (err) {
      toast.error(messageErreur(err));
      setEnvoi(false);
    }
  }

  if (campagne.isError || (id && perso.isError))
    return (
      <div className="px-4 py-20">
        <EtatVide
          icone={AlertTriangle}
          titre={campagne.isError ? 'Campagne introuvable' : 'Héros introuvable'}
          description={
            campagne.isError
              ? 'Impossible de créer un héros pour cette campagne.'
              : 'Ce héros a peut-être été supprimé.'
          }
        />
      </div>
    );

  const quitter = `/campagnes/${campagneId}/personnage`;
  // Le MJ réserve la création des héros : le joueur engage un personnage terminé
  const creationFermee =
    !id && campagne.data && !campagne.data.freeCreation && campagne.data.role !== 'gm';
  // Héros déjà en création dans cette campagne (proposé avant d'en commencer un autre)
  const enCours = id
    ? []
    : (engages.data ?? []).filter((p) => p.ownerId === profil.id && p.inCreation);

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
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">
                  Nouveau héros{campagne.data ? ` · ${campagne.data.name}` : ''}
                </p>
                <h1 className="text-balance text-3xl font-semibold tracking-tight">
                  {titreEtape(etape)}
                </h1>
                {regle?.description && (
                  <p className="max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
                    {regle.description}
                  </p>
                )}
              </div>
              {id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void recommencer()}
                  loading={supprimer.isPending}
                  className="shrink-0"
                >
                  {!supprimer.isPending && <RotateCcw />}
                  <span className="hidden sm:inline">Recommencer</span>
                </Button>
              )}
            </div>

            {creationFermee ? (
              <EtatVide
                icone={Lock}
                titre="Création réservée au MJ"
                description="Le maître du jeu attribue les personnages de cette campagne : choisissez un héros terminé."
                action={
                  <Button asChild variant="secondary">
                    <Link href={quitter}>Retour au choix du héros</Link>
                  </Button>
                }
              />
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
                  {etape.id === 'identite' && enCours.length > 0 && (
                    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.06] p-4 sm:flex-row sm:items-center">
                      <Hammer className="size-5 shrink-0 text-primary" />
                      <p className="min-w-0 flex-1 text-sm">
                        {enCours.length > 1
                          ? `${enCours.length} héros sont déjà en création dans cette campagne.`
                          : `${enCours[0]!.name} est déjà en création dans cette campagne.`}
                      </p>
                      <Button size="sm" variant="secondary" asChild>
                        <Link
                          href={`/personnages/nouveau?${new URLSearchParams({ campagne: campagneId, personnage: enCours[0]!.id })}`}
                          onClick={() => {
                            repris.current = false;
                            setId(enCours[0]!.id);
                          }}
                        >
                          Reprendre {enCours[0]!.name}
                        </Link>
                      </Button>
                    </div>
                  )}

                  {etape.id === 'identite' && (
                    <Identite nom={nom} setNom={setNom} details={details} setDetails={setDetails} />
                  )}

                  {regle && (!systeme || !etat || !fiche) && (
                    <Chargement texte="Chargement des règles…" />
                  )}
                  {regle && systeme && etat && fiche && (
                    <>
                      {regle.type === 'choisir' && (
                        <EtapeChoisir
                          systeme={systeme}
                          presentation={presentation}
                          etat={etat}
                          fiche={fiche}
                          etape={regle}
                          onEtat={enregistrer}
                        />
                      )}
                      {regle.type === 'tirer' && (
                        <EtapeTirer
                          etat={etat}
                          fiche={fiche}
                          etape={regle}
                          onTirer={(affectation) => tirer(regle.id, affectation)}
                        />
                      )}
                      {regle.type === 'saisir' && (
                        <EtapeSaisir
                          systeme={systeme}
                          etat={etat}
                          fiche={fiche}
                          etape={regle}
                          onEtat={enregistrer}
                        />
                      )}
                      {regle.type === 'repartir' && (
                        <EtapeRepartir
                          systeme={systeme}
                          etat={etat}
                          fiche={fiche}
                          etape={regle}
                          statut={statut(regle.id)}
                          onEtat={enregistrer}
                        />
                      )}
                      {regle.type === 'acheter' && (
                        <EtapeAcheter
                          systeme={systeme}
                          etat={etat}
                          fiche={fiche}
                          etape={regle}
                          onEtat={enregistrer}
                        />
                      )}
                      <RaisonsEtape statut={statut(regle.id)} />
                    </>
                  )}

                  {etape.id === 'portrait' && fiche && (
                    <EtapePortrait
                      fiche={fiche}
                      presentation={presentation}
                      portrait={portraitUrl}
                      onPortrait={setPortraitUrl}
                      nom={nom}
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
              <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
                <Button
                  variant="ghost"
                  onClick={() => aller(index - 1)}
                  className={cn(index === 0 && 'invisible')}
                >
                  <ArrowLeft />
                  Retour
                </Button>
                {etape.id === 'recap' ? (
                  <Button
                    size="lg"
                    onClick={() => void terminer()}
                    loading={envoi}
                    disabled={!toutesValides || !id}
                  >
                    <Sparkles />
                    Créer le personnage
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={() => void avancer(index + 1)}
                    loading={envoi}
                    disabled={!valide(etape) || !campagne.data}
                  >
                    Continuer
                    <ArrowRight />
                  </Button>
                )}
              </div>
            )}
          </main>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">
                Votre héros
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
                  Chargement des règles de la campagne…
                </div>
              )}
              {statuts.length > 0 && (
                <ul className="space-y-1.5 rounded-2xl border border-border bg-card p-4 text-[13px] shadow-surface">
                  {statuts.map((s) => (
                    <li key={s.etape.id} className="flex items-center gap-2.5">
                      <PastilleStatut statut={s.statut} />
                      <span
                        className={
                          s.statut === 'faite' ? 'text-foreground' : 'text-muted-foreground'
                        }
                      >
                        {s.etape.nom}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function titreEtape(e: EtapeUI): string {
  switch (e.id) {
    case 'identite':
      return 'Qui est votre héros ?';
    case 'portrait':
      return 'Donnez-lui un visage';
    case 'recap':
      return 'Prêt pour l’aventure ?';
    default:
      return e.nom;
  }
}

function PastilleStatut({ statut }: { statut: StatutEtape }) {
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
}: {
  statut: { statut: StatutEtape; raisons: string[] } | undefined;
}) {
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
}: {
  nom: string;
  setNom: (v: string) => void;
  details: DetailsPersonnage;
  setDetails: (d: DetailsPersonnage) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="p-nom">Nom</Label>
        <Input
          id="p-nom"
          autoFocus
          maxLength={60}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Aelys Vent-d'Argent"
          className="h-12 font-display text-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-concept">Concept</Label>
        <Input
          id="p-concept"
          maxLength={120}
          value={details.concept}
          onChange={(e) => setDetails({ ...details, concept: e.target.value })}
          placeholder="Une mage exilée qui cherche à racheter la faute de sa lignée."
        />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="p-apparence">Apparence</Label>
          <Textarea
            id="p-apparence"
            maxLength={2000}
            value={details.appearance}
            onChange={(e) => setDetails({ ...details, appearance: e.target.value })}
            placeholder="Cheveux d'argent, cicatrice à la joue, toujours une plume à la main…"
            className="min-h-[140px]"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-histoire">Histoire</Label>
          <Textarea
            id="p-histoire"
            maxLength={8000}
            value={details.backstory}
            onChange={(e) => setDetails({ ...details, backstory: e.target.value })}
            placeholder="D'où vient-il, que cherche-t-il, qui l'attend ?"
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
}: {
  statuts: { nom: string; statut: StatutEtape; raisons: string[] }[];
  identiteOk: boolean;
  details: DetailsPersonnage;
}) {
  const restantes = statuts.filter((s) => s.statut !== 'faite');
  return (
    <div className="space-y-5">
      {restantes.length > 0 || !identiteOk ? (
        <Message>
          Il reste à faire :{' '}
          {[...(identiteOk ? [] : ['Nom']), ...restantes.flatMap((s) => s.raisons)].join(' · ')}
        </Message>
      ) : (
        <Message ton="succes">Tout est en ordre : les règles valident votre personnage.</Message>
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
