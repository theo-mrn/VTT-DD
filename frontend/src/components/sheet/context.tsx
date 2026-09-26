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
  estExemplaire,
  ficheJson,
  nouvelExemplaire,
  nouvellePossession,
  recuperer,
  refusSaisie,
  rembourser as rembourserLocal,
  type AchatDisponible,
  type Attribut,
  type BonusLibre,
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
  type BonusRequest,
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
  /**
   * L'utilisateur mène une campagne où le personnage est engagé : il saisit les
   * attributs réservés au MJ (`saisie: mj`). Faux tant que la fiche ne le sait pas.
   */
  gm: boolean;
  pending: number;
  /** Variables CSS du thème, à reposer sur les dialogues (rendus hors du cadre). */
  variables: CSSProperties;
  write: CharacterTracker['write'];
  setValues(values: Record<string, Valeur>): Promise<boolean>;
  /**
   * Raison pour laquelle cet attribut ne se saisit pas maintenant (selon sa
   * `saisie`, la création et le rôle), `undefined` s'il se saisit.
   */
  valueRefusal(attribute: Attribut): string | undefined;
  /** L'attribut se saisit-il maintenant (`valueRefusal` vide) ? */
  canSetValue(attribute: Attribut): boolean;
  buy(purchase: string, item: string): Promise<boolean>;
  refund(index: number): Promise<boolean>;
  /** Ajoute ou met à jour un exemplaire (voir `PossessionUpdate`). */
  updatePossession(update: PossessionUpdate): Promise<boolean>;
  /** Retire un exemplaire précis (absent : l'exemplaire sans identifiant). */
  removePossession(entry: string, copy?: string): Promise<boolean>;
  rest(attributes?: string[]): Promise<boolean>;
  /** Pose un bonus libre (ou remplace celui qui a le même identifiant). */
  addBonus(bonus: BonusRequest): Promise<boolean>;
  /** Active ou désactive un bonus libre existant. */
  setBonusActive(id: string, active: boolean): Promise<boolean>;
  removeBonus(id: string): Promise<boolean>;
  /** Relit le personnage depuis le serveur (après un jet appliqué par le serveur). */
  reload(): void;
}

/** État avec ce bonus libre posé (à la place de celui qui a le même identifiant). */
function withBonus(e: EtatEntite, bonus: BonusLibre): EtatEntite {
  const s = copier(e);
  s.bonus = [...s.bonus.filter((b) => b.id !== bonus.id), bonus];
  return s;
}

/** Identifiant provisoire d'un nouveau bonus, pour l'aperçu (le serveur fixe le vrai). */
function previewBonusId(name: string, e: EtatEntite): string {
  const base = `apercu-${name.length}`;
  let id = base;
  for (let n = 2; e.bonus.some((b) => b.id === id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Aperçu local de `POST /possessions`, avec les mêmes règles de ciblage que le
 * service : `nouveau` ajoute un exemplaire (identifiant de `nouvelExemplaire`
 * si l'entrée est déjà possédée), `exemplaire` vise celui-là (null s'il
 * n'existe pas), sinon l'exemplaire sans identifiant, créé au besoin.
 */
export function previewPossessionUpdate(
  e: EtatEntite,
  update: PossessionUpdate,
): EtatEntite | null {
  const s = copier(e);
  const { entree, exemplaire } = update;
  const target = s.possessions.find((x) => estExemplaire(x, entree, exemplaire));
  // Exemplaire nommé : il doit exister pour une mise à jour, et pas pour un ajout
  if (exemplaire !== undefined && !!target === !!update.nouveau) return null;
  let p = update.nouveau ? undefined : target;
  if (!p) {
    // Sans identifiant : l'exemplaire sans identifiant, sauf un ajout à une entrée déjà possédée
    const owned = s.possessions.some((x) => x.entree === entree);
    const id =
      exemplaire ?? (update.nouveau && owned ? nouvelExemplaire(s.possessions, entree) : undefined);
    p = nouvellePossession(entree, update.rang ?? 0, id !== undefined ? { exemplaire: id } : {});
    s.possessions.push(p);
  }
  if (update.rang !== undefined) p.rang = update.rang;
  if (update.actif !== undefined) p.actif = update.actif;
  if (update.quantite !== undefined) p.quantite = update.quantite;
  if (update.choix) p.choix = { ...p.choix, ...update.choix };
  if (update.champs) p.champs = { ...p.champs, ...update.champs };
  if (update.effets) p.effets = update.effets;
  return s;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function useSheet(): SheetContextValue {
  const c = useContext(SheetContext);
  if (!c) throw new Error('useSheet doit être utilisé dans <SheetProvider>');
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
  gm = false,
  children,
  fallback,
}: {
  tracker: CharacterTracker;
  ready: ReadySystem;
  readOnly: boolean;
  /** L'utilisateur est MJ d'une campagne où le personnage est engagé (voir `SheetContextValue.gm`). */
  gm?: boolean;
  children: ReactNode;
  /** Affiché si le personnage ne se calcule pas avec ce système. */
  fallback: ReactNode;
}) {
  const { personnage: character, etat: state, write, pending, reload } = tracker;
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
    const valueRefusal = (a: Attribut) =>
      refusSaisie(a, state.creation, { proprietaire: !readOnly, mj: gm });
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
      gm,
      pending,
      variables,
      write,
      valueRefusal,
      canSetValue: (a) => valueRefusal(a) === undefined,
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
          attempt((e) => previewPossessionUpdate(e, update)),
        ),
      removePossession: (entry, copy) =>
        write(
          writes.removePossession(entry, copy),
          attempt((e) => {
            const s = copier(e);
            s.possessions = s.possessions.filter((p) => !estExemplaire(p, entry, copy));
            return s;
          }),
        ),
      rest: (attributes) =>
        write(
          writes.rest(attributes),
          attempt((e) => recuperer(calculer(system, e), attributes)),
        ),
      addBonus: (bonus) =>
        write(
          writes.bonus(bonus),
          attempt((e) => withBonus(e, { ...bonus, id: bonus.id ?? previewBonusId(bonus.nom, e) })),
        ),
      setBonusActive: (id, active) => {
        const b = state.bonus.find((x) => x.id === id);
        if (!b) return Promise.resolve(false);
        const next = { ...b, actif: active };
        return write(
          writes.bonus(next),
          attempt((e) => withBonus(e, next)),
        );
      },
      removeBonus: (id) =>
        write(
          writes.removeBonus(id),
          attempt((e) => ({ ...copier(e), bonus: e.bonus.filter((b) => b.id !== id) })),
        ),
      reload: () => void reload(),
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
    gm,
    pending,
    variables,
    write,
    reload,
  ]);

  if (!value) return <>{fallback}</>;
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}
