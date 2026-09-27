'use client';

import {
  calculer,
  creationDe,
  etapesCreation,
  terminerCreation,
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
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EtatVide } from '@/components/commun/page';
import { Chargement, Message } from '@/components/compte/elements';
import { EnTeteFocus, ProgressionEtapes } from '@/components/shell/cadre-focus';
import { CarteSysteme, CarteSystemeSquelette } from '@/components/systemes/carte-systeme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import { campagnes, useCampagne } from '@/lib/campagnes';
import { etatInitial, resumer } from '@/lib/creation';
import { useCreerPersonnage, type DetailsPersonnage } from '@/lib/personnages';
import { useSysteme, useSystemes } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import { ApercuFiche } from './apercu-fiche';
import { EtapeAcheter } from './etape-acheter';
import { EtapeChoisir } from './etape-choisir';
import { EtapePortrait } from './etape-portrait';
import { EtapeRepartir, EtapeSaisir } from './etape-saisir';
import { EtapeTirer } from './etape-tirer';

const CLE_BROUILLON = 'yner:v1:brouillon-personnage';

interface Brouillon {
  v: 1;
  systemeId: string;
  campagneId: string | null;
  etat: EtatEntite;
  nom: string;
  details: DetailsPersonnage;
  portraitUrl: string | null;
  etape: string;
}

type EtapeUI =
  | { id: 'systeme' | 'identite' | 'portrait' | 'recap'; nom: string }
  | { id: string; nom: string; regle: EtapeCreation };

function lireBrouillon(): Brouillon | null {
  try {
    const b = JSON.parse(localStorage.getItem(CLE_BROUILLON) ?? 'null') as Brouillon | null;
    return b?.v === 1 ? b : null;
  } catch {
    return null;
  }
}

function ecrireBrouillon(b: Brouillon | null) {
  try {
    if (b) localStorage.setItem(CLE_BROUILLON, JSON.stringify(b));
    else localStorage.removeItem(CLE_BROUILLON);
  } catch {
    // Stockage indisponible : le brouillon ne survivra pas au rechargement
  }
}

const DETAILS_VIDES: DetailsPersonnage = { concept: '', appearance: '', backstory: '' };

/**
 * Assistant de création de personnage, généré depuis les étapes déclarées par
 * le système (`creation`) : aucune règle de jeu ici, chaque action passe par
 * @vtt/rules. Le brouillon est gardé dans le navigateur à chaque changement.
 */
export function AssistantPersonnage() {
  const router = useRouter();
  const params = useSearchParams();
  const campagneId = params.get('campagne');
  const campagne = useCampagne(campagneId);
  const systemes = useSystemes();
  const creer = useCreerPersonnage();

  const [systemeId, setSystemeId] = useState<string | null>(params.get('systeme'));
  const [etat, setEtat] = useState<EtatEntite | null>(null);
  const [nom, setNom] = useState('');
  const [details, setDetails] = useState<DetailsPersonnage>(DETAILS_VIDES);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [courant, setCourant] = useState<string>(
    campagneId || params.get('systeme') ? 'identite' : 'systeme',
  );
  const [sens, setSens] = useState(1);
  const [pret, setPret] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const repris = useRef(false);

  // Le système d'une campagne est imposé
  useEffect(() => {
    if (campagne.data) setSystemeId(campagne.data.system);
  }, [campagne.data]);

  const sys = useSysteme(systemeId);
  const systeme = sys.data?.systeme ?? null;
  const presentation = sys.data?.presentation ?? null;

  // Reprise du brouillon (une fois), s'il correspond à la même campagne
  useEffect(() => {
    if (repris.current) return;
    repris.current = true;
    const b = lireBrouillon();
    if (
      b &&
      (b.campagneId ?? null) === (campagneId ?? null) &&
      (!params.get('systeme') || params.get('systeme') === b.systemeId)
    ) {
      setSystemeId(b.systemeId);
      setEtat(b.etat);
      setNom(b.nom);
      setDetails(b.details);
      setPortraitUrl(b.portraitUrl);
      setCourant(b.etape);
      toast('Brouillon repris', { description: 'Vous reprenez là où vous vous étiez arrêté.' });
    }
    setPret(true);
  }, [campagneId, params]);

  // Un nouveau système repart d'un état vierge
  useEffect(() => {
    if (!systeme) return;
    setEtat((e) => (e && e.systeme.id === systeme.source.id ? e : etatInitial(systeme)));
  }, [systeme]);

  useEffect(() => {
    if (!pret || !etat || !systemeId) return;
    const id = window.setTimeout(
      () =>
        ecrireBrouillon({
          v: 1,
          systemeId,
          campagneId,
          etat,
          nom,
          details,
          portraitUrl,
          etape: courant,
        }),
      400,
    );
    return () => window.clearTimeout(id);
  }, [pret, etat, systemeId, campagneId, nom, details, portraitUrl, courant]);

  const fiche = useMemo(() => (systeme && etat ? calculer(systeme, etat) : null), [systeme, etat]);
  const statuts = useMemo(
    () => (systeme && etat ? etapesCreation(systeme, etat) : []),
    [systeme, etat],
  );
  const statut = (id: string) => statuts.find((s) => s.etape.id === id);

  const regles = systeme ? (creationDe(systeme, 'personnage')?.etapes ?? []) : [];
  const etapes: EtapeUI[] = [
    ...(campagneId ? [] : [{ id: 'systeme' as const, nom: 'Système' }]),
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

  const valide = (e: EtapeUI): boolean => {
    if (e.id === 'systeme') return Boolean(systeme);
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

  function recommencer() {
    ecrireBrouillon(null);
    if (systeme) setEtat(etatInitial(systeme));
    setNom('');
    setDetails(DETAILS_VIDES);
    setPortraitUrl(null);
    aller(campagneId ? 0 : 1);
  }

  async function terminer() {
    if (!systeme || !etat) return;
    const fin = terminerCreation(systeme, etat);
    if (!fin.ok) {
      toast.error(fin.erreur);
      return;
    }
    setEnvoi(true);
    try {
      const p = await creer.mutateAsync({
        name: nom.trim(),
        portraitUrl,
        system: { id: systeme.source.id, version: systeme.source.version },
        state: fin.etat,
        roomId: campagneId,
        summary: resumer(calculer(systeme, fin.etat), presentation),
        details: {
          concept: details.concept.trim(),
          appearance: details.appearance.trim(),
          backstory: details.backstory.trim(),
        },
      });
      if (campagneId) await campagnes.incarner(campagneId, p.id);
      ecrireBrouillon(null);
      toast.success(`${p.name} est prêt pour l'aventure !`);
      router.replace(campagneId ? `/campagnes/${campagneId}` : `/personnages/${p.id}`);
    } catch (err) {
      toast.error(messageErreur(err));
      setEnvoi(false);
    }
  }

  if (campagneId && campagne.isError)
    return (
      <div className="px-4 py-20">
        <EtatVide
          icone={AlertTriangle}
          titre="Campagne introuvable"
          description="Impossible de créer un héros pour cette campagne."
        />
      </div>
    );

  const quitter = campagneId ? `/campagnes/${campagneId}/personnage` : '/personnages';

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
            onAller={(i) => (i <= index || etapes.slice(0, i).every(valide)) && aller(i)}
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
                  {campagne.data ? `Nouveau héros · ${campagne.data.name}` : 'Nouveau personnage'}
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
              {etat && etat.possessions.length + Object.keys(etat.valeurs).length > 0 && (
                <Button variant="ghost" size="sm" onClick={recommencer} className="shrink-0">
                  <RotateCcw />
                  <span className="hidden sm:inline">Recommencer</span>
                </Button>
              )}
            </div>

            <AnimatePresence mode="wait" custom={sens}>
              <motion.section
                key={etape.id}
                custom={sens}
                initial={{ opacity: 0, x: sens * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: sens * -28 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {etape.id === 'systeme' && (
                  <div
                    role="radiogroup"
                    aria-label="Système de jeu"
                    className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    {systemes.isLoading &&
                      Array.from({ length: 3 }, (_, i) => <CarteSystemeSquelette key={i} />)}
                    {systemes.data?.map((s) => (
                      <CarteSysteme
                        key={s.id}
                        systeme={s}
                        choisie={systemeId === s.id}
                        onChoisir={() => setSystemeId(s.id)}
                      />
                    ))}
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
                        onEtat={setEtat}
                      />
                    )}
                    {regle.type === 'tirer' && (
                      <EtapeTirer
                        systeme={systeme}
                        etat={etat}
                        fiche={fiche}
                        etape={regle}
                        onEtat={setEtat}
                      />
                    )}
                    {regle.type === 'saisir' && (
                      <EtapeSaisir
                        systeme={systeme}
                        etat={etat}
                        fiche={fiche}
                        etape={regle}
                        onEtat={setEtat}
                      />
                    )}
                    {regle.type === 'repartir' && (
                      <EtapeRepartir
                        systeme={systeme}
                        etat={etat}
                        fiche={fiche}
                        etape={regle}
                        statut={statut(regle.id)}
                        onEtat={setEtat}
                      />
                    )}
                    {regle.type === 'acheter' && (
                      <EtapeAcheter
                        systeme={systeme}
                        etat={etat}
                        fiche={fiche}
                        etape={regle}
                        onEtat={setEtat}
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
                  disabled={!toutesValides}
                >
                  <Sparkles />
                  Créer le personnage
                </Button>
              ) : (
                <Button size="lg" onClick={() => aller(index + 1)} disabled={!valide(etape)}>
                  Continuer
                  <ArrowRight />
                </Button>
              )}
            </div>
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
                  Choisissez un système pour voir votre fiche prendre forme.
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
    case 'systeme':
      return 'À quel jeu jouera-t-il ?';
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
      <p className="text-xs text-subtle">Seul le nom est requis ; le reste peut attendre.</p>
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
