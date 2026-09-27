'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EnTetePage, Page } from '@/components/commun/page';
import { DiceSettings } from '@/components/dice/dice-settings';
import { CarteResultat } from '@/components/des/carte-resultat';
import { useFichePersonnage } from '@/components/des/contexte-jet';
import { Macros, useMacros } from '@/components/des/macros';
import { PanneauJets } from '@/components/des/panneau-jets';
import { Plateau, type EtatPlateau } from '@/components/des/plateau';
import { Kbd } from '@/components/ui/kbd';
import { visibiliteDuBrouillon } from '@/components/des/visibilite';
import { ApiError, messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import { useDicePreferences } from '@/lib/dice-preferences';
import { prepareDice3D } from '@/lib/dice-throw';
import { useJets, useLancer, useSynchroJets, verifierFormule, type Jet } from '@/lib/jets';
import { usePersonnages, type Personnage } from '@/lib/personnages';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { useSession } from '@/lib/session';

const PLATEAU_INITIAL: EtatPlateau = {
  formule: '1d20',
  libelle: '',
  visibilite: 'public',
  campagneId: null,
  personnageId: null,
  version: 2,
};

/** Vrai si la frappe vise un champ ou une fenêtre : les raccourcis se taisent alors. */
function frappeAilleurs(e: KeyboardEvent): boolean {
  const cible = e.target instanceof Element ? e.target : null;
  return Boolean(
    cible?.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]',
    ),
  );
}

/** Table fixée sur une campagne (espace de jeu) : campagne et héros imposés. */
export interface ContexteTableDes {
  campagneId: string;
  campagneNom: string;
  /** MJ de la campagne : l'historique des jets peut être vidé. */
  gm: boolean;
  /** Héros incarné (ses modificateurs) ; null : MJ ou spectateur sans héros. */
  personnage: Personnage | null;
}

/**
 * Table de dés : plateau pour composer un jet, résultat en grand, macros,
 * historique et statistiques. Les jets passent par le service dice : les dés
 * 3D roulent, leurs faces lues à l'arrêt font le jet, et le résultat
 * s'affiche ensuite. Le brouillon du plateau est gardé dans ce navigateur ;
 * les macros suivent le profil. Avec `contexte`, la table est celle d'une
 * campagne : jets, visibilités et historique de la campagne, avec le héros incarné.
 */
export function TableDes({
  contexte,
  raccourcis = true,
}: {
  contexte?: ContexteTableDes;
  /** Raccourcis clavier actifs (faux quand l'écran est monté mais masqué, panneau fermé). */
  raccourcis?: boolean;
}) {
  const { profil } = useSession();
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
        ? { campagneId: contexte.campagneId, personnageId: contexte.personnage?.id ?? null }
        : {}),
    }),
    [enregistre, contexte?.campagneId, contexte?.personnage?.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [dernier, setDernier] = useState<Jet | null>(null);
  const refFormule = useRef<HTMLInputElement>(null);
  const refResultat = useRef<HTMLElement>(null);
  const enCours = useRef(false);

  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  // Un choix mémorisé peut viser une campagne quittée ou un personnage supprimé
  const campagne = campagnes.data?.find((c) => c.id === etat.campagneId) ?? null;
  const personnage = contexte
    ? contexte.personnage
    : (personnages.data?.find((p) => p.id === etat.personnageId) ?? null);
  const roomId = contexte ? contexte.campagneId : (campagne?.id ?? null);
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

  /** Ramène le résultat à l'écran (mobile, ou page défilée jusqu'aux macros). */
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

  async function lancerFormule(formule: string, libelle: string | null) {
    // Un seul jet à la fois : R, une macro ou Entrée pendant que les dés roulent ne relancent pas
    if (enCours.current) return;
    const verif = verifierFormule(formule, fiche.fiche);
    if (!verif.ok) {
      toast.error('Formule invalide', { description: verif.message });
      return;
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
    } catch (err) {
      toast.error('Le jet n’a pas pu être lancé', {
        description:
          err instanceof ApiError || !(err instanceof Error) ? messageErreur(err) : err.message,
      });
    } finally {
      enCours.current = false;
    }
  }

  const relancer = () =>
    affiche
      ? lancerFormule(affiche.formula, affiche.label)
      : lancerFormule(etat.formule, etat.libelle);

  // Raccourcis : R relance le dernier jet, 1 à 9 lancent les macros
  const actions = useRef({ relancer, macros, lancerFormule, raccourcis });
  actions.current = { relancer, macros, lancerFormule, raccourcis };
  useEffect(() => {
    function clavier(e: KeyboardEvent) {
      if (!actions.current.raccourcis) return;
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (frappeAilleurs(e)) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        void actions.current.relancer();
      } else if (/^[1-9]$/.test(e.key)) {
        const macro = actions.current.macros[Number(e.key) - 1];
        if (!macro) return;
        e.preventDefault();
        void actions.current.lancerFormule(macro.formula, macro.name);
      }
    }
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, []);

  return (
    <Page large>
      <EnTetePage
        surtitre={contexte ? contexte.campagneNom : 'Table de dés'}
        titre={contexte ? 'Dés de la table' : 'Lancer les dés'}
        description={
          contexte
            ? `Les jets de la campagne, en direct.${contexte.personnage ? ` Les modificateurs de ${contexte.personnage.name} sont à portée de clic.` : ''}`
            : 'Composez un jet, lancez, retrouvez-le. Les dés roulent en 3D et leurs faces font le jet, calculé par le service de dés avec le moteur de règles, fiche de personnage comprise.'
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-subtle md:flex">
              <span className="flex items-center gap-1.5">
                <Kbd>R</Kbd> relancer
              </span>
              <span aria-hidden className="h-3 w-px bg-border-strong" />
              <span className="flex items-center gap-1.5">
                <Kbd>1</Kbd>–<Kbd>9</Kbd> macros
              </span>
            </div>
            <DiceSettings />
          </div>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <CarteResultat
            ref={refResultat}
            jet={affiche}
            anime={dernier !== null && affiche === dernier}
            onRelancer={() => void relancer()}
            enCours={lancer.isPending}
          />
          <Plateau
            ref={refFormule}
            etat={etat}
            onModifier={modifier}
            verification={verification}
            fiche={fiche}
            contexteFixe={Boolean(contexte)}
            campagnes={{
              liste: campagnes.data ?? [],
              chargement: campagnes.isPending,
            }}
            personnages={
              contexte
                ? { liste: contexte.personnage ? [contexte.personnage] : [], chargement: false }
                : { liste: personnages.data ?? [], chargement: personnages.isPending }
            }
            onLancer={() => void lancerFormule(etat.formule, etat.libelle)}
            enCours={lancer.isPending}
          />
          <Macros
            formule={etat.formule}
            libelle={etat.libelle}
            formuleValide={verification.ok}
            onLancer={(m) => void lancerFormule(m.formula, m.name)}
            onCharger={(m) => {
              modifier({ formule: m.formula, libelle: m.name });
              refFormule.current?.focus();
            }}
          />
        </div>

        <PanneauJets
          jets={jets.data ?? []}
          chargement={jets.isPending}
          erreur={jets.error}
          moi={profil?.id ?? null}
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
      </div>
    </Page>
  );
}
