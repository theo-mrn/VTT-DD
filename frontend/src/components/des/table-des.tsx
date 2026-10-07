'use client';

import { useTranslations } from 'next-intl';
import { aleatoireCrypto, evaluerChampEntree } from '@vtt/rules';
import { useDiceShortcuts } from './raccourcis-des';
import { MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EnTetePage, Page } from '@/components/commun/page';
import {
  avecBonusRetenus,
  bonusAUsage,
  bonusDeJet,
  BonusJetListe,
  bonusRetenus,
  type ActionsBonus,
} from '@/components/des/bonus-jet';
import { useFichePersonnage } from '@/components/des/contexte-jet';
import { formuleAvecAttributs, useDemandeJet } from '@/components/des/demande-jet';
import { Lanceur, type EtatPlateau } from '@/components/des/lanceur';
import { useMacros } from '@/components/des/macros';
import { PanneauJets } from '@/components/des/panneau-jets';
import { visibiliteDuBrouillon } from '@/components/des/visibilite';
import { ApiError, messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import { useDicePreferences } from '@/lib/dice-preferences';
import { prepareDice3D } from '@/lib/dice-throw';
import { useJets, useLancer, useSynchroJets, verifierFormule, type Jet } from '@/lib/jets';
import { useOperationsPersonnage, usePersonnages, type Personnage } from '@/lib/personnages';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { cn } from '@/lib/utils';

const PLATEAU_INITIAL: EtatPlateau = {
  formule: '1d20',
  libelle: '',
  visibilite: 'public',
  campagneId: null,
  personnageId: null,
  version: 2,
};

/** Table fixée sur une campagne (espace de jeu) : campagne et héros imposés. */
export interface ContexteTableDes {
  campagneId: string;
  campagneNom: string;
  /** MJ de la campagne : l'historique des jets peut être vidé. */
  gm: boolean;
  /** Héros incarné (ses modificateurs) ; null : MJ ou spectateur sans héros. */
  personnage: Personnage | null;
  /** MJ : personnages de la campagne, au choix (leurs modificateurs et leurs bonus). */
  personnages?: Personnage[];
}

/** Campagne, personnage et salle du jet : ceux de la table d'une campagne, sinon les choix gardés. */
function choixActifs(
  contexte: ContexteTableDes | undefined,
  etat: EtatPlateau,
  campagnes: ReturnType<typeof useCampagnes>['data'],
  personnages: ReturnType<typeof usePersonnages>['data'],
) {
  const campagne = campagnes?.find((c) => c.id === etat.campagneId) ?? null;
  const personnage = contexte
    ? (contexte.personnage ?? contexte.personnages?.find((p) => p.id === etat.personnageId) ?? null)
    : (personnages?.find((p) => p.id === etat.personnageId) ?? null);
  const roomId = contexte ? contexte.campagneId : (campagne?.id ?? null);
  return { campagne, personnage, roomId };
}

/**
 * Table de dés : lanceur compact (dernier résultat, formule, dés, macros),
 * historique dense et statistiques. Les jets passent par le service dice : les dés
 * 3D roulent, leurs faces lues à l'arrêt font le jet, et le résultat
 * s'affiche ensuite. Le brouillon du plateau est gardé dans ce navigateur ;
 * les macros suivent le profil. Avec `contexte`, la table est celle d'une
 * campagne : jets, visibilités et historique de la campagne, avec le héros incarné.
 */
export function TableDes({
  contexte,
  raccourcis = true,
}: Readonly<{
  contexte?: ContexteTableDes;
  /** Raccourcis clavier actifs (faux quand l'écran est monté mais masqué, panneau fermé). */
  raccourcis?: boolean;
}>) {
  const t = useTranslations('dice.launcher');
  const [enregistre, setEtat] = usePreferenceLocale<EtatPlateau>(
    contexte ? `des:table:${contexte.campagneId}` : 'des:plateau',
    PLATEAU_INITIAL,
  );
  // Un brouillon d'une ancienne version peut manquer de champs, ou dater
  // d'avant les visibilités du service dice ; une table de campagne impose les siens
  const etat = useMemo(
    (): EtatPlateau => ({
      ...PLATEAU_INITIAL,
      ...enregistre,
      visibilite: visibiliteDuBrouillon(enregistre.visibilite, enregistre.version),
      version: 2,
      ...(contexte
        ? {
            campagneId: contexte.campagneId,
            // Le MJ garde son choix parmi les personnages de la campagne
            personnageId:
              contexte.personnage?.id ??
              (contexte.personnages ? (enregistre.personnageId ?? null) : null),
          }
        : {}),
    }),
    [enregistre, contexte?.campagneId, contexte?.personnage?.id, contexte?.personnages], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [dernier, setDernier] = useState<Jet | null>(null);
  const refFormule = useRef<HTMLInputElement>(null);
  const refResultat = useRef<HTMLDivElement>(null);
  const enCours = useRef(false);

  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  // Un choix mémorisé peut viser une campagne quittée ou un personnage supprimé
  const { campagne, personnage, roomId } = choixActifs(
    contexte,
    etat,
    campagnes.data,
    personnages.data,
  );
  const fiche = useFichePersonnage(personnage);

  const jets = useJets(roomId);
  const { live } = useSynchroJets(roomId);
  const lancer = useLancer();
  const { macros } = useMacros();
  const prefs = useDicePreferences().data;

  // Lanceur 3D chargé et shaders du skin préchauffés dès l'arrivée sur la table
  const skin = prefs?.animation3d ? prefs.skinId : null;
  useEffect(() => {
    if (skin) prepareDice3D([skin]);
  }, [skin]);

  const verification = useMemo(
    () => verifierFormule(etat.formule, fiche.fiche),
    [etat.formule, fiche.fiche],
  );

  // Bonus de jet du personnage (conditionnels) : allumés, ils s'ajoutent à chaque jet jusqu'à
  // ce qu'on les éteigne ; gardés par personnage dans ce navigateur (panneau fermé, rechargement)
  const bonus = useMemo(
    () => bonusDeJet(fiche.fiche, etat.formule, fiche.presentation),
    [fiche.fiche, etat.formule, fiche.presentation],
  );
  const avecBonus = bonus.length > 0;
  const [allumes, setAllumes] = usePreferenceLocale<string[]>(
    `des:bonus:${personnage?.id ?? 'aucun'}`,
    [],
  );
  const choisis = useMemo(() => new Set(allumes), [allumes]);
  // Bonus allumés pour le jet seulement (capacités à invoquer, usages limités)
  const basculerBonus = (cles: string[], actif: boolean) =>
    setAllumes(
      actif ? [...new Set([...allumes, ...cles])] : allumes.filter((c) => !cles.includes(c)),
    );
  // Écritures sur la fiche depuis les dés : activer une capacité, consommer un usage
  const ops = useOperationsPersonnage(personnage?.id ?? '');
  const signaler = (e: unknown) => toast.error(messageErreur(e));
  // L'interrupteur d'un bonus est son état sur la fiche : il l'écrit
  const actionsBonus: ActionsBonus | undefined =
    personnage && fiche.ecriture
      ? {
          basculer(b, actif) {
            if (b.type === 'effet') void ops.effet(b.cles, actif).catch(signaler);
            else if (b.type === 'donne') {
              if (!actif) return void ops.retirerPossession(b.entree).catch(signaler);
              // Se donner les effets de la capacité, pour sa durée (dés tirés ici)
              const champ = fiche.fiche?.systeme.source.effetsDonnes?.duree;
              const brute =
                champ && fiche.fiche
                  ? evaluerChampEntree(fiche.fiche, b.capacite, champ, {
                      aleatoire: aleatoireCrypto(),
                    })
                  : undefined;
              const duree = Math.floor(Number(brute ?? 0));
              void ops
                .possession({ entree: b.entree, ...(duree >= 1 ? { duree } : {}) })
                .catch(signaler);
            } else if (b.type === 'source')
              void ops
                .possession({
                  entree: b.entree,
                  ...(b.exemplaire !== undefined ? { exemplaire: b.exemplaire } : {}),
                  actif,
                })
                .catch(signaler);
            else {
              const { decompte, ...reste } = b.bonus;
              void ops
                .bonus({
                  ...reste,
                  actif,
                  ...(decompte
                    ? {
                        decompte: {
                          moment: decompte.moment,
                          ...(decompte.de ? { de: decompte.de } : {}),
                        },
                      }
                    : {}),
                })
                .catch(signaler);
            }
          },
        }
      : undefined;
  async function lancerPlateau() {
    const retenus = bonusRetenus(bonus, choisis);
    if (!retenus.length) return void lancerFormule(etat.formule, etat.libelle);
    // Le libellé garde la trace des bonus ajoutés (historique)
    const sources = [...new Set(retenus.map((b) => b.source))].join(', ');
    const libelle = etat.libelle.trim()
      ? t('labelWithSources', { label: etat.libelle.trim(), sources })
      : t('withSources', { sources });
    const aUsage = bonusAUsage(retenus);
    const ok = await lancerFormule(avecBonusRetenus(etat.formule, retenus), libelle);
    if (!ok || !aUsage.length || !personnage || !fiche.ecriture) return;
    // Usage limité : le jet en consomme une utilisation, et le bonus s'éteint
    const sourcesUsage = new Set(aUsage.map((b) => b.sourceId));
    setAllumes(
      allumes.filter((c) => !bonus.some((b) => b.cle === c && sourcesUsage.has(b.sourceId))),
    );
    try {
      for (const b of aUsage) await ops.usage(b.entree!, false);
    } catch (e) {
      signaler(e);
    }
  }

  // Le jet qu'on vient de lancer, sinon le plus récent du contexte (sans animation)
  const affiche = dernier ?? jets.data?.[0] ?? null;

  const etatActuel = useRef(etat);
  etatActuel.current = etat;
  const modifier = useCallback(
    (maj: Partial<EtatPlateau>) => {
      if (maj.campagneId !== undefined && maj.campagneId !== etatActuel.current.campagneId)
        setDernier(null);
      // Mis à jour tout de suite : deux modifications dans le même tour ne s'écrasent pas
      etatActuel.current = { ...etatActuel.current, ...maj };
      setEtat(etatActuel.current);
    },
    [setEtat],
  );

  // « Lancer » depuis une capacité de la fiche : ses bonus allumés, l'attribut visé ajouté
  const demande = useDemandeJet((s) => s.demande);
  const viderDemande = useDemandeJet((s) => s.vider);
  useEffect(() => {
    if (!demande) return;
    // Le MJ lance pour le personnage de la fiche : il devient celui du panneau
    if (contexte?.personnages?.some((p) => p.id === demande.personnageId)) {
      if (etatActuel.current.personnageId !== demande.personnageId)
        return modifier({ personnageId: demande.personnageId });
    } else if (!personnage || demande.personnageId !== personnage.id) {
      // Personnage hors de ce panneau (PNJ…) : la demande ne sera jamais prise
      if (contexte?.personnages) viderDemande();
      return;
    }
    viderDemande();
    setAllumes([...new Set([...allumes, ...demande.bonus])]);
    const formule = formuleAvecAttributs(etatActuel.current.formule, demande.attributs);
    if (formule !== etatActuel.current.formule) modifier({ formule });
  }, [demande, personnage, contexte?.personnages]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ramène le résultat à l'écran (mobile, ou page défilée jusqu'à l'historique). */
  function reveler() {
    const carte = refResultat.current;
    if (!carte) return;
    const { top } = carte.getBoundingClientRect();
    if (top >= 56 && top <= window.innerHeight - 160) return;
    const doux = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    carte.scrollIntoView({
      behavior: doux ? 'smooth' : 'auto',
      block: 'start',
    });
  }

  /** Lance une formule ; vrai si le jet a eu lieu. */
  async function lancerFormule(formule: string, libelle: string | null): Promise<boolean> {
    // Un seul jet à la fois : R, une macro ou Entrée pendant que les dés roulent ne relancent pas
    if (enCours.current) return false;
    const verif = verifierFormule(formule, fiche.fiche);
    if (!verif.ok) {
      toast.error(t('invalid'), { description: verif.message });
      return false;
    }
    enCours.current = true;
    try {
      // Les dés roulent d'abord ; le service calcule le jet avec leurs faces
      const jet = await lancer.mutateAsync({
        formula: formule,
        label: libelle?.trim() || null,
        visibility: etat.visibilite,
        roomId,
        characterId: personnage?.id ?? null,
        fiche: fiche.fiche,
      });
      setDernier(jet);
      reveler();
      return true;
    } catch (err) {
      toast.error(t('rollFailed'), {
        description:
          err instanceof ApiError || !(err instanceof Error) ? messageErreur(err) : err.message,
      });
      return false;
    } finally {
      enCours.current = false;
    }
  }

  const relancer = () =>
    affiche
      ? lancerFormule(affiche.formula, affiche.label)
      : lancerFormule(etat.formule, etat.libelle);

  // Raccourcis : R relance le dernier jet, 1 à 9 lancent les macros, et ceux du joueur
  useDiceShortcuts(raccourcis, { relancer, lancerFormule, macros });

  const journal = (
    <PanneauJets
      jets={jets.data ?? []}
      chargement={jets.isPending}
      erreur={jets.error}
      roomId={roomId}
      campagne={contexte ? contexte.campagneNom : (campagne?.name ?? null)}
      peutEffacer={contexte ? contexte.gm : !campagne || campagne.role === 'gm'}
      live={live}
      plusAnciens={{
        possible: jets.hasNextPage,
        enCours: jets.isFetchingNextPage,
        charger: () => void jets.fetchNextPage(),
      }}
      onRelancer={(j) => void lancerFormule(j.formula, j.label)}
      onEfface={() => setDernier(null)}
    />
  );

  const table = (
    <div>
      {/* Bonus de jet à droite du lanceur (sous lui sur mobile), sur toute la hauteur */}
      <div
        className={cn(
          'mx-auto grid w-full gap-3',
          // Colonnes fixes sur grand écran : le panneau Dés prend la largeur de son contenu
          'max-w-[34rem] lg:max-w-none',
          avecBonus ? 'lg:grid-cols-[32rem_18rem]' : 'lg:grid-cols-[32rem]',
        )}
      >
        <div ref={refResultat} className="min-w-0 scroll-mt-20">
          <Lanceur
            ref={refFormule}
            etat={etat}
            onModifier={modifier}
            verification={verification}
            fiche={fiche}
            contexteFixe={Boolean(contexte)}
            choixPersonnage={Boolean(contexte?.personnages && !contexte.personnage)}
            sousTitre={
              contexte
                ? (contexte.personnage?.name ?? contexte.campagneNom)
                : [campagne?.name ?? t('personal'), personnage?.name].filter(Boolean).join(' · ')
            }
            campagnes={{
              liste: campagnes.data ?? [],
              chargement: campagnes.isPending,
            }}
            personnages={
              contexte
                ? {
                    liste:
                      contexte.personnages ?? (contexte.personnage ? [contexte.personnage] : []),
                    chargement: false,
                  }
                : { liste: personnages.data ?? [], chargement: personnages.isPending }
            }
            onLancer={() => void lancerPlateau()}
            enCours={lancer.isPending}
            onLancerMacro={(m) => void lancerFormule(m.formula, m.name)}
            onChargerMacro={(m) => {
              modifier({ formule: m.formula, libelle: m.name });
              refFormule.current?.focus();
            }}
            jet={affiche}
            anime={dernier !== null && affiche === dernier}
            onRelancer={() => void relancer()}
          />
        </div>
        {avecBonus && (
          <BonusJetListe
            bonus={bonus}
            choisis={choisis}
            onBasculer={basculerBonus}
            {...(actionsBonus ? { actions: actionsBonus } : {})}
            className="max-h-72 lg:sticky lg:top-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100dvh-9rem)] lg:self-start"
          />
        )}
        {journal}
      </div>
    </div>
  );

  // Espace de jeu : le panneau flottant porte déjà son titre
  if (contexte)
    return (
      <MotionConfig reducedMotion="user">
        <div className="p-3 sm:p-4">{table}</div>
      </MotionConfig>
    );

  return (
    <MotionConfig reducedMotion="user">
      <Page className={avecBonus ? 'max-w-[54rem]' : 'max-w-[38rem]'}>
        <EnTetePage className="mb-4 sm:mb-5" surtitre="Table de dés" titre="Lancer les dés" />
        {table}
      </Page>
    </MotionConfig>
  );
}
