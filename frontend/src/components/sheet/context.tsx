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
  writes,
  getPurchases,
  useVersionedRead,
  type PossessionUpdate,
  type Character,
  type CharacterTracker,
} from '@/lib/characters';
import type { ReadySystem } from '@/lib/systems';
import { loadFonts, themeVariables } from './theme';

export interface SheetContextValue {
  ready: ReadySystem;
  system: SystemeCharge;
  presentation: Presentation;
  character: Character;
  /** État affiché (serveur + aperçus en attente). */
  state: EtatEntite;
  /** Fiche calculée localement sur l'état affiché. */
  sheet: Fiche;
  /** Valeurs affichées : celles du serveur, ou le calcul local pendant une écriture. */
  json: FicheJson;
  /** Achats possibles : ceux du serveur s'ils sont à jour, sinon le calcul local. */
  purchases: AchatDisponible[];
  readOnly: boolean;
  pending: number;
  /** Variables CSS du thème, à reposer sur les dialogues (rendus hors du cadre). */
  variables: CSSProperties;
  write: CharacterTracker['write'];
  setValues(values: Record<string, Valeur>): Promise<boolean>;
  buy(purchase: string, item: string): Promise<boolean>;
  refund(index: number): Promise<boolean>;
  updatePossession(update: PossessionUpdate): Promise<boolean>;
  removePossession(entry: string): Promise<boolean>;
  rest(attributes?: string[]): Promise<boolean>;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function useSheet(): SheetContextValue {
  const c = useContext(SheetContext);
  if (!c) throw new Error('useFiche doit être utilisé dans <FournisseurFiche>');
  return c;
}

/** Calcul local protégé : un état incohérent avec le système ne casse pas la page. */
export function computeOn(system: SystemeCharge, state: EtatEntite): Fiche | null {
  try {
    return calculer(system, state);
  } catch {
    return null;
  }
}

export function SheetProvider({
  tracker,
  ready,
  readOnly,
  children,
  fallback,
}: {
  tracker: CharacterTracker;
  ready: ReadySystem;
  readOnly: boolean;
  children: ReactNode;
  /** Affiché si le personnage ne se calcule pas avec ce système. */
  fallback: ReactNode;
}) {
  const { personnage: character, etat: state, write, pending } = tracker;
  const { system, presentation } = ready;
  const sheet = useMemo(() => (state ? computeOn(system, state) : null), [system, state]);
  const serverPurchases = useVersionedRead('achats', character, pending, getPurchases);
  const localPurchases = useMemo(
    () => (sheet && !serverPurchases ? achatsPossibles(sheet) : []),
    [sheet, serverPurchases],
  );
  const variables = useMemo(() => themeVariables(presentation), [presentation]);

  useEffect(() => loadFonts(presentation), [presentation]);

  const value = useMemo<SheetContextValue | null>(() => {
    if (!character || !state || !sheet) return null;
    // Copie des erreurs : les évaluations faites ensuite par l'interface ne s'y ajoutent pas
    const json =
      !pending && character.fiche?.valeurs
        ? character.fiche
        : { ...ficheJson(sheet), erreurs: [...sheet.erreurs] };
    const attempt =
      (f: (e: EtatEntite) => EtatEntite | null) =>
      (e: EtatEntite): EtatEntite | null => {
        try {
          return f(e);
        } catch {
          return null;
        }
      };
    return {
      ready,
      system,
      presentation,
      character,
      state,
      sheet,
      json,
      purchases: serverPurchases ?? localPurchases,
      readOnly,
      pending,
      variables,
      write,
      setValues: (values) =>
        write(
          writes.values(values),
          attempt((e) => {
            const s = copier(e);
            Object.assign(s.valeurs, values);
            return s;
          }),
        ),
      buy: (purchase, item) =>
        write(
          writes.buy(purchase, item),
          attempt((e) => {
            const r = acheterLocal(system, e, { achat: purchase, objet: item });
            return r.ok ? r.etat : null;
          }),
        ),
      refund: (index) =>
        write(
          writes.refund(index),
          attempt((e) => {
            const r = rembourserLocal(system, e, index);
            return r.ok ? r.etat : null;
          }),
        ),
      updatePossession: (update) =>
        write(
          writes.possession(update),
          attempt((e) => {
            const s = copier(e);
            let p = s.possessions.find((x) => x.entree === update.entree);
            if (!p) {
              p = nouvellePossession(update.entree, update.rang ?? 0);
              s.possessions.push(p);
            }
            if (update.rang !== undefined) p.rang = update.rang;
            if (update.actif !== undefined) p.actif = update.actif;
            if (update.choix) p.choix = { ...p.choix, ...update.choix };
            if (update.champs) p.champs = { ...p.champs, ...update.champs };
            return s;
          }),
        ),
      removePossession: (entry) =>
        write(
          writes.removePossession(entry),
          attempt((e) => {
            const s = copier(e);
            s.possessions = s.possessions.filter((p) => p.entree !== entry);
            return s;
          }),
        ),
      rest: (attributes) =>
        write(
          writes.rest(attributes),
          attempt((e) => recuperer(calculer(system, e), attributes)),
        ),
    };
  }, [
    ready,
    system,
    presentation,
    character,
    state,
    sheet,
    serverPurchases,
    localPurchases,
    readOnly,
    pending,
    variables,
    write,
  ]);

  if (!value) return <>{fallback}</>;
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}
