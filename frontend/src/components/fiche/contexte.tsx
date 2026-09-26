'use client';

/**
 * Contexte partagé par les blocs de la fiche : système et présentation,
 * personnage, fiche recalculée localement sur l'état affiché, achats
 * possibles, et opérations d'écriture (chacune avec son aperçu local).
 */
import {
  acheter as acheterLocal,
  achatsPossibles,
  calculer,
  copier,
  ficheJson,
  nouvellePossession,
  recuperer,
  rembourser as rembourserLocal,
  type AchatDisponible,
  type EtatEntite,
  type Fiche,
  type FicheJson,
  type Presentation,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ecritures,
  lireAchats,
  useLectureVersionnee,
  type MajPossession,
  type Personnage,
  type SuiviPersonnage,
} from '@/lib/personnages';
import type { SystemePret } from '@/lib/systemes';
import { chargerPolices, variablesTheme } from './theme';

export interface ContexteFiche {
  pret: SystemePret;
  systeme: SystemeCharge;
  presentation: Presentation;
  personnage: Personnage;
  /** État affiché (serveur + aperçus en attente). */
  etat: EtatEntite;
  /** Fiche calculée localement sur l'état affiché. */
  fiche: Fiche;
  /** Valeurs affichées : celles du serveur, ou le calcul local pendant une écriture. */
  json: FicheJson;
  /** Achats possibles : ceux du serveur s'ils sont à jour, sinon le calcul local. */
  achats: AchatDisponible[];
  lectureSeule: boolean;
  enAttente: number;
  /** Variables CSS du thème, à reposer sur les dialogues (rendus hors du cadre). */
  variables: CSSProperties;
  ecrire: SuiviPersonnage['ecrire'];
  fixerValeurs(valeurs: Record<string, Valeur>): Promise<boolean>;
  acheter(achat: string, objet: string): Promise<boolean>;
  rembourser(index: number): Promise<boolean>;
  majPossession(maj: MajPossession): Promise<boolean>;
  retirerPossession(entree: string): Promise<boolean>;
  repos(attributs?: string[]): Promise<boolean>;
}

const Contexte = createContext<ContexteFiche | null>(null);

export function useFiche(): ContexteFiche {
  const c = useContext(Contexte);
  if (!c) throw new Error('useFiche doit être utilisé dans <FournisseurFiche>');
  return c;
}

/** Calcul local protégé : un état incohérent avec le système ne casse pas la page. */
export function calculerSur(systeme: SystemeCharge, etat: EtatEntite): Fiche | null {
  try {
    return calculer(systeme, etat);
  } catch {
    return null;
  }
}

export function FournisseurFiche({
  suivi,
  pret,
  lectureSeule,
  children,
  repli,
}: {
  suivi: SuiviPersonnage;
  pret: SystemePret;
  lectureSeule: boolean;
  children: ReactNode;
  /** Affiché si le personnage ne se calcule pas avec ce système. */
  repli: ReactNode;
}) {
  const { personnage, etat, ecrire, enAttente } = suivi;
  const { systeme, presentation } = pret;
  const fiche = useMemo(() => (etat ? calculerSur(systeme, etat) : null), [systeme, etat]);
  const achatsServeur = useLectureVersionnee('achats', personnage, enAttente, lireAchats);
  const achatsLocaux = useMemo(
    () => (fiche && !achatsServeur ? achatsPossibles(fiche) : []),
    [fiche, achatsServeur],
  );
  const variables = useMemo(() => variablesTheme(presentation), [presentation]);

  useEffect(() => chargerPolices(presentation), [presentation]);

  const valeur = useMemo<ContexteFiche | null>(() => {
    if (!personnage || !etat || !fiche) return null;
    // Copie des erreurs : les évaluations faites ensuite par l'interface ne s'y ajoutent pas
    const json =
      !enAttente && personnage.fiche?.valeurs
        ? personnage.fiche
        : { ...ficheJson(fiche), erreurs: [...fiche.erreurs] };
    const essai =
      (f: (e: EtatEntite) => EtatEntite | null) =>
      (e: EtatEntite): EtatEntite | null => {
        try {
          return f(e);
        } catch {
          return null;
        }
      };
    return {
      pret,
      systeme,
      presentation,
      personnage,
      etat,
      fiche,
      json,
      achats: achatsServeur ?? achatsLocaux,
      lectureSeule,
      enAttente,
      variables,
      ecrire,
      fixerValeurs: (valeurs) =>
        ecrire(
          ecritures.valeurs(valeurs),
          essai((e) => {
            const s = copier(e);
            Object.assign(s.valeurs, valeurs);
            return s;
          }),
        ),
      acheter: (achat, objet) =>
        ecrire(
          ecritures.acheter(achat, objet),
          essai((e) => {
            const r = acheterLocal(systeme, e, { achat, objet });
            return r.ok ? r.etat : null;
          }),
        ),
      rembourser: (index) =>
        ecrire(
          ecritures.rembourser(index),
          essai((e) => {
            const r = rembourserLocal(systeme, e, index);
            return r.ok ? r.etat : null;
          }),
        ),
      majPossession: (maj) =>
        ecrire(
          ecritures.possession(maj),
          essai((e) => {
            const s = copier(e);
            let p = s.possessions.find((x) => x.entree === maj.entree);
            if (!p) {
              p = nouvellePossession(maj.entree, maj.rang ?? 0);
              s.possessions.push(p);
            }
            if (maj.rang !== undefined) p.rang = maj.rang;
            if (maj.actif !== undefined) p.actif = maj.actif;
            if (maj.choix) p.choix = { ...p.choix, ...maj.choix };
            if (maj.champs) p.champs = { ...p.champs, ...maj.champs };
            return s;
          }),
        ),
      retirerPossession: (entree) =>
        ecrire(
          ecritures.retirerPossession(entree),
          essai((e) => {
            const s = copier(e);
            s.possessions = s.possessions.filter((p) => p.entree !== entree);
            return s;
          }),
        ),
      repos: (attributs) =>
        ecrire(
          ecritures.repos(attributs),
          essai((e) => recuperer(calculer(systeme, e), attributs)),
        ),
    };
  }, [
    pret,
    systeme,
    presentation,
    personnage,
    etat,
    fiche,
    achatsServeur,
    achatsLocaux,
    lectureSeule,
    enAttente,
    variables,
    ecrire,
  ]);

  if (!valeur) return <>{repli}</>;
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
