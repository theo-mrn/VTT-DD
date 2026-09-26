/**
 * Regroupement des exports Firestore par salle : pour chaque `Salle/{code}`,
 * réunit ses membres, ses personnages, ses sessions et sa discussion.
 *
 * Membres d'une salle, vus à plusieurs endroits (l'ancienne app n'avait pas de
 * liste de membres) :
 *   - le créateur (`Salle/{code}.creatorId`) ;
 *   - `users/{uid}/rooms/{code}` : salles rejointes ou créées ;
 *   - `salles/{code}/Noms/{uid}` : qui a choisi un personnage ou le rôle de MJ ;
 *   - `users/{uid}.room_id` : salle ouverte en dernier.
 * Les documents de membres dont la salle n'existe plus sont écartés (salles
 * orphelines, comptées dans le résultat).
 */
import type {
  DocFirestore,
  MessageLegacy,
  NomLegacy,
  PersonnageLegacy,
  SalleLegacy,
  SessionLegacy,
  UtilisateurLegacy,
} from './legacy.js';
import { texte } from './legacy.js';

export interface ExportsSalles {
  /** `Salle` exporté récursivement : salles, sessions et discussion. */
  salles: readonly DocFirestore[];
  /** `salles` exporté récursivement : `salles/{code}/Noms/{uid}`. */
  noms: readonly DocFirestore[];
  /** `users` exporté récursivement : `room_id`, `persoId` et `users/{uid}/rooms`. */
  users: readonly DocFirestore[];
  /** `cartes` : seuls les personnages `cartes/{code}/characters/{id}` servent. */
  cartes: readonly DocFirestore[];
  /** `gameSystems` : nom des systèmes de jeu. */
  systemes: readonly DocFirestore[];
}

export type OrigineMembre = 'createur' | 'rooms' | 'noms' | 'room_id';

export interface MembreLegacy {
  uid: string;
  /** Où l'adhésion a été vue. */
  origines: OrigineMembre[];
  /** `salles/{code}/Noms/{uid}.nom` (à défaut `users/{uid}.perso`) : « MJ » ou `Nomperso`. */
  nom?: string;
  /** `users/{uid}.persoId`, seulement si `users/{uid}.room_id` est cette salle. */
  persoId?: string;
}

export interface SalleAImporter {
  /** Id du document `Salle` : le code de la salle. */
  code: string;
  /** Identifiant stable pour `legacy_ids` : chemin du document. */
  legacyId: string;
  doc: DocFirestore<SalleLegacy>;
  /** Système de la salle, pour `detecterSysteme`. */
  systeme: { gameSystemId?: string; nomSysteme?: string };
  /** Créateur d'abord, puis dans l'ordre des exports. */
  membres: MembreLegacy[];
  /** `cartes/{code}/characters/{id}`. */
  personnages: DocFirestore<PersonnageLegacy>[];
  sessions: DocFirestore<SessionLegacy>[];
  messages: DocFirestore<MessageLegacy>[];
}

export interface Regroupement {
  salles: SalleAImporter[];
  /** Codes cités par des membres ou des personnages sans document `Salle` (salles supprimées). */
  orphelines: string[];
}

const segments = (path: string) => path.split('/');

export function regrouperSalles(e: ExportsSalles): Regroupement {
  const systemes = new Map<string, Record<string, unknown>>();
  for (const d of e.systemes) if (segments(d.path).length === 2) systemes.set(d.id, d.data ?? {});

  const salles = new Map<string, SalleAImporter>();
  const sousDocs: DocFirestore[] = [];
  for (const d of e.salles) {
    const s = segments(d.path);
    if (s[0] !== 'Salle') continue;
    if (s.length !== 2) {
      sousDocs.push(d);
      continue;
    }
    const data = (d.data ?? {}) as SalleLegacy;
    const gameSystemId = texte(data.gameSystemId);
    const nomSysteme = gameSystemId ? texte(systemes.get(gameSystemId)?.name) : undefined;
    salles.set(d.id, {
      code: d.id,
      legacyId: d.path,
      doc: d as DocFirestore<SalleLegacy>,
      systeme: {
        ...(gameSystemId ? { gameSystemId } : {}),
        ...(nomSysteme ? { nomSysteme } : {}),
      },
      membres: [],
      personnages: [],
      sessions: [],
      messages: [],
    });
  }

  const orphelines = new Set<string>();
  const salleDe = (code: string | undefined) => {
    if (!code) return undefined;
    const salle = salles.get(code);
    if (!salle) orphelines.add(code);
    return salle;
  };

  // Sessions et discussion : Salle/{code}/sessions/{id}, Salle/{code}/chat/{id}
  for (const d of sousDocs) {
    const s = segments(d.path);
    if (s.length !== 4) continue;
    const salle = salles.get(s[1]!);
    if (!salle) continue;
    if (s[2] === 'sessions') salle.sessions.push(d as DocFirestore<SessionLegacy>);
    else if (s[2] === 'chat') salle.messages.push(d as DocFirestore<MessageLegacy>);
  }

  const membre = (salle: SalleAImporter, uid: string, origine: OrigineMembre): MembreLegacy => {
    let m = salle.membres.find((x) => x.uid === uid);
    if (!m) {
      m = { uid, origines: [] };
      salle.membres.push(m);
    }
    if (!m.origines.includes(origine)) m.origines.push(origine);
    return m;
  };

  // Le créateur d'abord
  for (const salle of salles.values()) {
    const createur = texte(salle.doc.data?.creatorId);
    if (createur) membre(salle, createur, 'createur');
  }

  // users/{uid}/rooms/{code}, puis users/{uid}.room_id et persoId
  for (const d of e.users) {
    const s = segments(d.path);
    if (s.length === 4 && s[2] === 'rooms') {
      const salle = salleDe(s[3]);
      if (salle) membre(salle, s[1]!, 'rooms');
    }
  }
  const actifs = new Map<string, UtilisateurLegacy>(); // uid → document, si room_id connu
  for (const d of e.users) {
    if (segments(d.path).length !== 2) continue;
    const u = (d.data ?? {}) as UtilisateurLegacy;
    const salle = salleDe(texte(u.room_id));
    if (!salle) continue;
    const m = membre(salle, d.id, 'room_id');
    const persoId = texte(u.persoId);
    if (persoId) m.persoId = persoId;
    actifs.set(d.id, u);
  }

  // salles/{code}/Noms/{uid}
  for (const d of e.noms) {
    const s = segments(d.path);
    if (s.length !== 4 || s[0] !== 'salles' || s[2] !== 'Noms') continue;
    const salle = salleDe(s[1]);
    if (!salle) continue;
    const m = membre(salle, s[3]!, 'noms');
    const nom = texte((d.data as NomLegacy | undefined)?.nom);
    if (nom) m.nom = nom;
  }
  // À défaut de Noms, users/{uid}.perso de la salle active dit la même chose
  for (const salle of salles.values()) {
    for (const m of salle.membres) {
      if (m.nom) continue;
      const u = actifs.get(m.uid);
      const perso = u && texte(u.room_id) === salle.code ? texte(u.perso) : undefined;
      if (perso) m.nom = perso;
    }
  }

  // Personnages : cartes/{code}/characters/{id}
  for (const d of e.cartes) {
    const s = segments(d.path);
    if (s.length !== 4 || s[0] !== 'cartes' || s[2] !== 'characters') continue;
    const salle = salleDe(s[1]);
    if (salle) salle.personnages.push(d as DocFirestore<PersonnageLegacy>);
  }

  return { salles: [...salles.values()], orphelines: [...orphelines].sort() };
}
