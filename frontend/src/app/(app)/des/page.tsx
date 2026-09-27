'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { EnTetePage, Page } from '@/components/commun/page';
import { CarteResultat } from '@/components/des/carte-resultat';
import { useFichePersonnage } from '@/components/des/contexte-jet';
import { Macros, useMacros } from '@/components/des/macros';
import { PanneauJets } from '@/components/des/panneau-jets';
import { Plateau, type EtatPlateau } from '@/components/des/plateau';
import { Kbd } from '@/components/ui/kbd';
import { ApiError, messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import { calculerJet, useJets, useLancer, verifierFormule, type Jet } from '@/lib/jets';
import { usePersonnages } from '@/lib/personnages';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { useSession } from '@/lib/session';

const PLATEAU_INITIAL: EtatPlateau = {
  formule: '1d20',
  libelle: '',
  visibilite: 'public',
  campagneId: null,
  personnageId: null,
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

/**
 * Table de dés : plateau pour composer un jet, résultat en grand, macros,
 * historique et statistiques. Le brouillon du plateau est gardé dans ce
 * navigateur ; les macros suivent le profil.
 */
export default function PageDes() {
  const { profil } = useSession();
  const [enregistre, setEtat] = usePreferenceLocale<EtatPlateau>('des:plateau', PLATEAU_INITIAL);
  // Un brouillon d'une ancienne version peut manquer de champs
  const etat = useMemo(() => ({ ...PLATEAU_INITIAL, ...enregistre }), [enregistre]);
  const [dernier, setDernier] = useState<Jet | null>(null);
  const refFormule = useRef<HTMLInputElement>(null);
  const refResultat = useRef<HTMLElement>(null);

  const campagnes = useCampagnes();
  const personnages = usePersonnages();
  // Un choix mémorisé peut viser une campagne quittée ou un personnage supprimé
  const campagne = campagnes.data?.find((c) => c.id === etat.campagneId) ?? null;
  const personnage = personnages.data?.find((p) => p.id === etat.personnageId) ?? null;
  const roomId = campagne?.id ?? null;
  const fiche = useFichePersonnage(personnage);

  const jets = useJets(roomId);
  const lancer = useLancer();
  const { macros } = useMacros();

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
    carte.scrollIntoView({ behavior: doux ? 'smooth' : 'auto', block: 'start' });
  }

  async function lancerFormule(formule: string, libelle: string | null) {
    const verif = verifierFormule(formule, fiche.fiche);
    if (!verif.ok) {
      toast.error('Formule invalide', { description: verif.message });
      return;
    }
    try {
      // Tiré ici pour que l'animation montre exactement ce qui est enregistré
      const resultat = calculerJet(formule, { fiche: fiche.fiche });
      const jet = await lancer.mutateAsync({
        formula: formule,
        label: libelle?.trim() || null,
        visibility: etat.visibilite,
        roomId,
        characterId: personnage?.id ?? null,
        characterName: personnage?.name ?? null,
        resultat,
      });
      setDernier(jet);
      reveler();
    } catch (err) {
      toast.error('Le jet n’a pas pu être lancé', {
        description:
          err instanceof ApiError || !(err instanceof Error) ? messageErreur(err) : err.message,
      });
    }
  }

  const relancer = () =>
    affiche
      ? lancerFormule(affiche.formula, affiche.label)
      : lancerFormule(etat.formule, etat.libelle);

  // Raccourcis : R relance le dernier jet, 1 à 9 lancent les macros
  const actions = useRef({ relancer, macros, lancerFormule });
  actions.current = { relancer, macros, lancerFormule };
  useEffect(() => {
    function clavier(e: KeyboardEvent) {
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
        surtitre="Table de dés"
        titre="Lancer les dés"
        description="Composez un jet, lancez, retrouvez-le. Chaque dé est tiré au hasard cryptographique et calculé par le moteur de règles, fiche de personnage comprise."
        actions={
          <div className="hidden items-center gap-3 rounded-lg border border-border bg-surface/60 px-3 py-1.5 text-xs text-subtle md:flex">
            <span className="flex items-center gap-1.5">
              <Kbd>R</Kbd> relancer
            </span>
            <span aria-hidden className="h-3 w-px bg-border-strong" />
            <span className="flex items-center gap-1.5">
              <Kbd>1</Kbd>–<Kbd>9</Kbd> macros
            </span>
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
            campagnes={{ liste: campagnes.data ?? [], chargement: campagnes.isPending }}
            personnages={{ liste: personnages.data ?? [], chargement: personnages.isPending }}
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
          campagne={campagne?.name ?? null}
          onRelancer={(j) => void lancerFormule(j.formula, j.label)}
          onEfface={() => setDernier(null)}
        />
      </div>
    </Page>
  );
}
