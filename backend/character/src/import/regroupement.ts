/**
 * Regroupement des exports Firestore par personnage : pour chaque personnage
 * legacy, réunit ce que `transformerPersonnage` attend (inventaire, bonus,
 * compétences personnalisées, spécialisations et stats du système de la salle)
 * et désigne son propriétaire.
 *
 * Propriétaire d'un personnage de salle (`cartes/{room}/characters/{id}`) :
 *   1. le joueur dont `users/{uid}.persoId` pointe sur ce personnage ;
 *   2. sinon le seul joueur qui en garde une copie (`users/{uid}/characters`,
 *      écrite à la création, même `Nomperso`) ;
 *   3. sinon (PNJ, joueur parti) le créateur de la salle (`Salle/{room}.creatorId`).
 * Les copies de `users/{uid}/characters` sont des doublons des personnages de
 * salle : seules les copies sans personnage de salle correspondant (salle
 * supprimée) sont importées, au nom de leur joueur.
 */
import type {
  BonusLegacy,
  CompetencePersonnaliseeLegacy,
  DocFirestore,
  ObjetInventaireLegacy,
  PersonnageLegacy,
  SpecialisationLegacy,
} from './legacy.js';
import { texte } from './legacy.js';
import type { OptionsTransformation } from './transformer.js';

export interface Exports {
  /** `cartes` exporté récursivement (personnages et leurs compétences personnalisées). */
  cartes: readonly DocFirestore[];
  /** `users` exporté récursivement (persoId, copies des personnages). */
  users: readonly DocFirestore[];
  /** `Salle` exporté récursivement (créateur, système, surcharges de contenu). */
  salles: readonly DocFirestore[];
  /** `gameSystems` exporté récursivement (nom, stats, contenu). */
  systemes: readonly DocFirestore[];
  /** `Inventaire` exporté récursivement. */
  inventaire: readonly DocFirestore[];
  /** `Bonus` exporté récursivement. */
  bonus: readonly DocFirestore[];
  /**
   * `salles` exporté récursivement : `salles/{code}/Noms/{uid}.nom` est le
   * personnage que joue actuellement le membre (ou « MJ »). Facultatif.
   */
  noms?: readonly DocFirestore[];
}

export interface PersonnageAImporter {
  doc: DocFirestore<PersonnageLegacy>;
  /** Identifiant stable pour `legacy_ids` : chemin du document. */
  legacyId: string;
  roomId?: string;
  /** UID Firebase du propriétaire, et comment il a été trouvé. */
  ownerUid?: string;
  origineProprietaire: 'persoId' | 'noms' | 'copie' | 'createur-salle' | 'compte' | 'inconnu';
  /** Options du transformateur, sans les systèmes chargés. */
  options: Omit<OptionsTransformation, 'systemes'>;
  /** Système de la salle, pour `detecterSysteme`. */
  salle: { gameSystemId?: string; nomSysteme?: string };
}

const segments = (path: string) => path.split('/');

/** Documents d'une sous-collection : `prefixe/{id}` exactement un niveau sous le préfixe. */
function enfants<T>(docs: readonly DocFirestore[], prefixe: string): DocFirestore<T>[] {
  const profondeur = segments(prefixe).length + 1;
  return docs.filter(
    (d) => d.path.startsWith(prefixe + '/') && segments(d.path).length === profondeur,
  ) as DocFirestore<T>[];
}

/** Documents racines d'une collection (`collection/{id}`), par id. */
function racines(docs: readonly DocFirestore[]): Map<string, Record<string, unknown>> {
  const r = new Map<string, Record<string, unknown>>();
  for (const d of docs) if (segments(d.path).length === 2) r.set(d.id, d.data ?? {});
  return r;
}

/** Spécialisations du contenu rangé sous `prefixe/content/`, par id de document. */
function specialisationsDe(e: Exports, prefixe: string): Record<string, SpecialisationLegacy> {
  const r: Record<string, SpecialisationLegacy> = {};
  for (const d of [...e.systemes, ...e.salles]) {
    if (!d.path.startsWith(prefixe + '/content/')) continue;
    const data = (d.data ?? {}) as Record<string, unknown>;
    if (data.kind === 'specialization') r[d.id] = data as SpecialisationLegacy;
  }
  return r;
}

/** Spécialisations de tout le contenu exporté (systèmes et surcharges de salle). */
function toutesSpecialisationsDe(e: Exports): Record<string, SpecialisationLegacy> {
  const r: Record<string, SpecialisationLegacy> = {};
  for (const d of [...e.systemes, ...e.salles]) {
    const data = (d.data ?? {}) as Record<string, unknown>;
    if (d.path.includes('/content/') && data.kind === 'specialization')
      r[d.id] = data as SpecialisationLegacy;
  }
  return r;
}

/** Joueurs : personnage actif (persoId → uid) et copies de leurs personnages. */
function joueurs(users: readonly DocFirestore[]): {
  persoIdDe: Map<string, string>;
  copies: DocFirestore<PersonnageLegacy>[];
} {
  const persoIdDe = new Map<string, string>(); // persoId → uid
  const copies: DocFirestore<PersonnageLegacy>[] = [];
  for (const d of users) {
    const s = segments(d.path);
    if (s.length === 2) {
      const persoId = texte((d.data ?? {}).persoId);
      if (persoId) persoIdDe.set(persoId, d.id);
    } else if (s.length === 4 && s[2] === 'characters') {
      copies.push(d as DocFirestore<PersonnageLegacy>);
    }
  }
  return { persoIdDe, copies };
}

/** Joueurs qui gardent une copie de chaque personnage : Nomperso → uids. */
function uidsDesCopies(
  copies: readonly DocFirestore<PersonnageLegacy>[],
): Map<string, Set<string>> {
  const uidDesCopies = new Map<string, Set<string>>();
  for (const c of copies) {
    const nom = texte(c.data?.Nomperso);
    if (!nom) continue;
    const uids = uidDesCopies.get(nom) ?? new Set<string>();
    uids.add(segments(c.path)[1]!);
    uidDesCopies.set(nom, uids);
  }
  return uidDesCopies;
}

/** Personnage joué par chaque membre d'une salle : code → Nomperso → uids. */
function joueursParSalle(
  noms: readonly DocFirestore[] | undefined,
): Map<string, Map<string, Set<string>>> {
  const joueursParNom = new Map<string, Map<string, Set<string>>>();
  for (const d of noms ?? []) {
    const s = segments(d.path);
    if (s.length !== 4 || s[0] !== 'salles' || s[2] !== 'Noms') continue;
    const nom = texte((d.data ?? {}).nom);
    if (!nom || nom === 'MJ') continue;
    const parNom = joueursParNom.get(s[1]!) ?? new Map<string, Set<string>>();
    const uids = parNom.get(nom) ?? new Set<string>();
    uids.add(s[3]!);
    parNom.set(nom, uids);
    joueursParNom.set(s[1]!, parNom);
  }
  return joueursParNom;
}

/** Index des exports utiles au regroupement de chaque personnage de salle. */
interface Index {
  e: Exports;
  salles: Map<string, Record<string, unknown>>;
  systemes: Map<string, Record<string, unknown>>;
  toutesSpecialisations: Record<string, SpecialisationLegacy>;
  persoIdDe: Map<string, string>;
  uidDesCopies: Map<string, Set<string>>;
  joueursParNom: Map<string, Map<string, Set<string>>>;
}

/** Propriétaire d'un personnage de salle, dans l'ordre de priorité de l'en-tête. */
function proprietaire(
  index: Index,
  docId: string,
  roomId: string,
  nom: string | undefined,
  salle: Record<string, unknown>,
): { ownerUid: string | undefined; origine: PersonnageAImporter['origineProprietaire'] } {
  let ownerUid: string | undefined = index.persoIdDe.get(docId);
  let origine: PersonnageAImporter['origineProprietaire'] = ownerUid ? 'persoId' : 'inconnu';
  // Liste des membres de la salle : le joueur qui joue ce personnage (un seul)
  const joueurs = nom ? index.joueursParNom.get(roomId)?.get(nom) : undefined;
  if (!ownerUid && joueurs?.size === 1) {
    ownerUid = [...joueurs][0];
    origine = 'noms';
  }
  if (!ownerUid && nom && index.uidDesCopies.get(nom)?.size === 1) {
    ownerUid = [...index.uidDesCopies.get(nom)!][0];
    origine = 'copie';
  }
  if (!ownerUid) {
    const createur = texte(salle.creatorId);
    if (createur) {
      ownerUid = createur;
      origine = 'createur-salle';
    }
  }
  return { ownerUid, origine };
}

/**
 * Un personnage peut référencer une spécialisation d'un ancien système de
 * la salle (overrides `custom_…` successifs) : les ids Firestore étant
 * uniques, on cherche dans tout le contenu exporté, le système courant
 * de la salle ayant priorité.
 */
function specialisationsDeSalle(
  index: Index,
  roomId: string,
  gameSystemId: string | undefined,
): Record<string, SpecialisationLegacy> {
  if (!gameSystemId) return { ...index.toutesSpecialisations };
  return {
    ...index.toutesSpecialisations,
    ...specialisationsDe(index.e, `gameSystems/${gameSystemId}`),
    ...specialisationsDe(index.e, `Salle/${roomId}/gameSystemOverrides/${gameSystemId}`),
  };
}

/** Personnage de salle (`cartes/{room}/characters/{id}`) et ce qu'il emporte. */
function personnageDeSalle(
  index: Index,
  doc: DocFirestore<PersonnageLegacy>,
  roomId: string,
  nom: string | undefined,
): PersonnageAImporter {
  const { e } = index;
  const salle = index.salles.get(roomId) ?? {};
  const gameSystemId = texte(salle.gameSystemId);
  const systeme = gameSystemId ? index.systemes.get(gameSystemId) : undefined;
  const { ownerUid, origine } = proprietaire(index, doc.id, roomId, nom, salle);

  const cle = nom ?? '';
  const specialisations = specialisationsDeSalle(index, roomId, gameSystemId);
  const stats = Array.isArray(systeme?.stats)
    ? (systeme.stats as { key: string; recoversToZero?: boolean }[])
    : undefined;

  return {
    doc,
    legacyId: doc.path,
    roomId,
    ...(ownerUid ? { ownerUid } : {}),
    origineProprietaire: origine,
    salle: {
      ...(gameSystemId ? { gameSystemId } : {}),
      ...(texte(systeme?.name) ? { nomSysteme: texte(systeme?.name)! } : {}),
    },
    options: {
      inventaire: cle
        ? enfants<ObjetInventaireLegacy>(e.inventaire, `Inventaire/${roomId}/${cle}`)
        : [],
      bonus: cle ? enfants<BonusLegacy>(e.bonus, `Bonus/${roomId}/${cle}`) : [],
      competencesPersonnalisees: enfants<CompetencePersonnaliseeLegacy>(
        e.cartes,
        `${doc.path}/customCompetences`,
      ),
      specialisations,
      ...(stats ? { statsSalle: stats } : {}),
    },
  };
}

export function regrouperPersonnages(e: Exports): PersonnageAImporter[] {
  const { persoIdDe, copies } = joueurs(e.users);
  const index: Index = {
    e,
    // Salles : créateur et système
    salles: racines(e.salles),
    // Systèmes : nom, stats, spécialisations du contenu
    systemes: racines(e.systemes),
    toutesSpecialisations: toutesSpecialisationsDe(e),
    persoIdDe,
    uidDesCopies: uidsDesCopies(copies),
    joueursParNom: joueursParSalle(e.noms),
  };

  const resultat: PersonnageAImporter[] = [];
  const nomsEnSalle = new Set<string>();

  for (const d of e.cartes) {
    const s = segments(d.path);
    if (s.length !== 4 || s[0] !== 'cartes' || s[2] !== 'characters') continue;
    const doc = d as DocFirestore<PersonnageLegacy>;
    const p = doc.data ?? {};
    const nom = texte(p.Nomperso);
    if (nom) nomsEnSalle.add(nom);
    resultat.push(personnageDeSalle(index, doc, s[1]!, nom));
  }

  // Copies orphelines : leur salle n'existe plus, le personnage n'existe qu'ici
  for (const c of copies) {
    const nom = texte(c.data?.Nomperso);
    if (nom && nomsEnSalle.has(nom)) continue;
    resultat.push({
      doc: c,
      legacyId: c.path,
      ownerUid: segments(c.path)[1]!,
      origineProprietaire: 'compte',
      salle: {},
      // Salle disparue : spécialisations retrouvées dans tout le contenu exporté
      options: { specialisations: index.toutesSpecialisations },
    });
  }

  return resultat;
}
