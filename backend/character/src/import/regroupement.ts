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
}

export interface PersonnageAImporter {
  doc: DocFirestore<PersonnageLegacy>;
  /** Identifiant stable pour `legacy_ids` : chemin du document. */
  legacyId: string;
  roomId?: string;
  /** UID Firebase du propriétaire, et comment il a été trouvé. */
  ownerUid?: string;
  origineProprietaire: 'persoId' | 'copie' | 'createur-salle' | 'compte' | 'inconnu';
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

export function regrouperPersonnages(e: Exports): PersonnageAImporter[] {
  // Salles : créateur et système
  const salles = new Map<string, Record<string, unknown>>();
  for (const d of e.salles) if (segments(d.path).length === 2) salles.set(d.id, d.data ?? {});

  // Systèmes : nom, stats, spécialisations du contenu
  const systemes = new Map<string, Record<string, unknown>>();
  for (const d of e.systemes) if (segments(d.path).length === 2) systemes.set(d.id, d.data ?? {});
  const specialisationsDe = (prefixe: string): Record<string, SpecialisationLegacy> => {
    const r: Record<string, SpecialisationLegacy> = {};
    for (const d of [...e.systemes, ...e.salles]) {
      if (!d.path.startsWith(prefixe + '/content/')) continue;
      const data = (d.data ?? {}) as Record<string, unknown>;
      if (data.kind === 'specialization') r[d.id] = data as SpecialisationLegacy;
    }
    return r;
  };

  const toutesSpecialisations: Record<string, SpecialisationLegacy> = {};
  for (const d of [...e.systemes, ...e.salles]) {
    const data = (d.data ?? {}) as Record<string, unknown>;
    if (d.path.includes('/content/') && data.kind === 'specialization')
      toutesSpecialisations[d.id] = data as SpecialisationLegacy;
  }

  // Joueurs : personnage actif, copies de leurs personnages
  const persoIdDe = new Map<string, string>(); // persoId → uid
  const copies: DocFirestore<PersonnageLegacy>[] = [];
  for (const d of e.users) {
    const s = segments(d.path);
    if (s.length === 2) {
      const persoId = texte((d.data ?? {}).persoId);
      if (persoId) persoIdDe.set(persoId, d.id);
    } else if (s.length === 4 && s[2] === 'characters') {
      copies.push(d as DocFirestore<PersonnageLegacy>);
    }
  }
  const uidDesCopies = new Map<string, Set<string>>(); // Nomperso → uids
  for (const c of copies) {
    const nom = texte(c.data?.Nomperso);
    if (!nom) continue;
    const uids = uidDesCopies.get(nom) ?? new Set<string>();
    uids.add(segments(c.path)[1]!);
    uidDesCopies.set(nom, uids);
  }

  const resultat: PersonnageAImporter[] = [];
  const nomsEnSalle = new Set<string>();

  for (const d of e.cartes) {
    const s = segments(d.path);
    if (s.length !== 4 || s[0] !== 'cartes' || s[2] !== 'characters') continue;
    const doc = d as DocFirestore<PersonnageLegacy>;
    const roomId = s[1]!;
    const p = doc.data ?? {};
    const nom = texte(p.Nomperso);
    if (nom) nomsEnSalle.add(nom);

    const salle = salles.get(roomId) ?? {};
    const gameSystemId = texte(salle.gameSystemId);
    const systeme = gameSystemId ? systemes.get(gameSystemId) : undefined;

    let ownerUid: string | undefined = persoIdDe.get(doc.id);
    let origine: PersonnageAImporter['origineProprietaire'] = ownerUid ? 'persoId' : 'inconnu';
    if (!ownerUid && nom && uidDesCopies.get(nom)?.size === 1) {
      ownerUid = [...uidDesCopies.get(nom)!][0];
      origine = 'copie';
    }
    if (!ownerUid) {
      const createur = texte(salle.creatorId);
      if (createur) {
        ownerUid = createur;
        origine = 'createur-salle';
      }
    }

    const cle = nom ?? '';
    // Un personnage peut référencer une spécialisation d'un ancien système de
    // la salle (overrides `custom_…` successifs) : les ids Firestore étant
    // uniques, on cherche dans tout le contenu exporté, le système courant
    // de la salle ayant priorité.
    const specialisations = {
      ...toutesSpecialisations,
      ...(gameSystemId
        ? {
            ...specialisationsDe(`gameSystems/${gameSystemId}`),
            ...specialisationsDe(`Salle/${roomId}/gameSystemOverrides/${gameSystemId}`),
          }
        : {}),
    };
    const stats = Array.isArray(systeme?.stats)
      ? (systeme.stats as { key: string; recoversToZero?: boolean }[])
      : undefined;

    resultat.push({
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
    });
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
      options: {},
    });
  }

  return resultat;
}
