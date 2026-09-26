/**
 * Migration d'une salle de l'ancienne app. Fonction pure : aucun accès à la
 * base ; les UID Firebase et les chemins des personnages restent tels quels,
 * ils sont traduits au chargement (voir `preparerSalle`).
 *
 * Tout ce qui ne peut pas être migré, ou dont la valeur change, devient un
 * avertissement, jamais une exception.
 *
 * Rôles :
 *   - le créateur (`creatorId`) est MJ et propriétaire ;
 *   - un membre entré comme MJ (`salles/{code}/Noms/{uid}.nom` = « MJ ») est
 *     MJ : l'ancienne app lui en donnait tous les droits (co-MJ) ;
 *   - les autres membres sont joueurs ; un banni n'est pas membre.
 * Personnage incarné : `users/{uid}.persoId` si la salle est la salle active du
 * joueur, sinon le personnage de la salle dont le nom est dans `Noms`.
 * Camp : `joueurs` pour un personnage de type « joueurs », `adversaires` sinon.
 */
import { FORME_CODE_SALLE } from '../modules/salles/code.js';
import type { Camp, Role } from '../db/schema.js';
import {
  booleen,
  dateIso,
  NOM_MJ,
  nombre,
  slug,
  texte,
  type DocFirestore,
  type PersonnageLegacy,
} from './legacy.js';
import type { SalleAImporter } from './regroupement.js';

export const SYSTEMES_MIGRES = ['dnd-classic', 'star-wars-eote', 'nooblies'] as const;
export type IdSystemeMigre = (typeof SYSTEMES_MIGRES)[number];

/** Bornes de l'API (modules/schemas.ts et contraintes de la base). */
export const LIMITES = {
  nom: 100,
  description: 2000,
  maxJoueurs: { min: 1, max: 50, defaut: 4 },
  imageUrl: 2048,
  message: 1000,
} as const;

export interface MembreMigre {
  uid: string;
  role: Role;
  /** Chemin legacy du personnage incarné (`cartes/{code}/characters/{id}`). */
  incarne?: string;
}

export interface SalleMigree {
  /** Code de la salle, ou `null` si l'ancien ne respecte pas la forme (nouveau code au chargement). */
  code: string | null;
  nom: string;
  description: string;
  systemeId: IdSystemeMigre;
  imageUrl: string | null;
  maxJoueurs: number;
  publique: boolean;
  creationPersonnages: boolean;
  /** UID Firebase du créateur. */
  proprietaireUid?: string;
  membres: MembreMigre[];
  /** UID Firebase des bannis. */
  bannis: string[];
  personnages: { legacyId: string; nom?: string; camp: Camp }[];
  sessions: { prevueLe: string }[];
  /** Du plus ancien au plus récent. */
  messages: { auteurUid: string; texte: string; createdAt: string }[];
  avertissements: string[];
}

// ─── Détection du système ────────────────────────────────────────────────────
// Même logique que l'import des personnages (backend/character/src/import/transformer.ts),
// pour que la salle et ses personnages tombent sur le même système.

const CHAMPS_STAR_WARS = [
  'skillRanks',
  'career',
  'specializations',
  'unlockedTalents',
  'xpSpent',
  'Obligations',
  'vigueur',
  'agilite',
];

/** Système d'un personnage legacy, comme `detecterSysteme` de character. */
export function detecterSysteme(
  p: PersonnageLegacy,
  salle: { gameSystemId?: string; nomSysteme?: string } = {},
): { id: IdSystemeMigre; certain: boolean } {
  if (salle.gameSystemId === 'dnd-classic') return { id: 'dnd-classic', certain: true };
  const nom = slug(salle.nomSysteme ?? '');
  if (/star-wars|confins-de-l-empire|edge-of-the-empire/.test(nom))
    return { id: 'star-wars-eote', certain: true };
  if (/noobli/.test(nom)) return { id: 'nooblies', certain: true };
  if (CHAMPS_STAR_WARS.some((c) => p[c] !== undefined))
    return { id: 'star-wars-eote', certain: true };
  if (Object.keys(p).some((c) => /^Voie\d+$/.test(c) && texte(p[c])))
    return { id: 'dnd-classic', certain: true };
  return { id: 'dnd-classic', certain: false };
}

/**
 * Système d'une salle : celui que désigne la salle (`gameSystemId`, nom du
 * système), sinon celui de ses personnages (le plus fréquent). Une salle sans
 * `gameSystemId` date d'avant les systèmes : D&D, sauf si ses personnages
 * disent autre chose.
 */
export function systemeSalle(
  salle: { gameSystemId?: string; nomSysteme?: string },
  personnages: readonly DocFirestore<PersonnageLegacy>[],
): { id: IdSystemeMigre; certain: boolean } {
  const parSalle = detecterSysteme({}, salle);
  if (parSalle.certain) return parSalle;
  const votes = new Map<IdSystemeMigre, number>();
  for (const p of personnages) {
    const d = detecterSysteme(p.data ?? {});
    if (d.certain) votes.set(d.id, (votes.get(d.id) ?? 0) + 1);
  }
  const classes = [...votes].sort((a, b) => b[1] - a[1]);
  if (!classes.length) return { id: 'dnd-classic', certain: !salle.gameSystemId };
  return { id: classes[0]![0], certain: classes.length === 1 };
}

// ─── Salle ───────────────────────────────────────────────────────────────────

const HEBERGEMENT_FIREBASE =
  /firebasestorage\.googleapis\.com|\.appspot\.com|storage\.googleapis\.com/;

function tronquer(v: string, max: number, quoi: string, avertir: (m: string) => void): string {
  const caracteres = [...v];
  if (caracteres.length <= max) return v;
  avertir(`${quoi} tronqué(e) à ${max} caractères (${caracteres.length})`);
  return caracteres.slice(0, max).join('').trimEnd();
}

export function transformerSalle(a: SalleAImporter): SalleMigree {
  const avertissements: string[] = [];
  const avertir = (m: string) => avertissements.push(m);
  const s = a.doc.data ?? {};

  // Code : les codes à 6 chiffres de l'ancienne app sont repris tels quels
  const codeLegacy = a.code.trim().toUpperCase();
  const code = FORME_CODE_SALLE.test(codeLegacy) ? codeLegacy : null;
  if (!code) avertir(`Code « ${a.code} » hors forme : un nouveau code sera tiré`);

  // Nom, description
  let nom = texte(s.title);
  if (!nom) {
    nom = `Salle ${a.code}`;
    avertir(`Salle sans titre : nommée « ${nom} »`);
  }
  nom = tronquer(nom, LIMITES.nom, 'Titre', avertir);
  const description = tronquer(
    texte(s.description) ?? '',
    LIMITES.description,
    'Description',
    avertir,
  );

  // Système
  const systeme = systemeSalle(a.systeme, a.personnages);
  if (!systeme.certain) {
    const source = a.systeme.gameSystemId
      ? `système « ${a.systeme.nomSysteme ?? a.systeme.gameSystemId} » non reconnu`
      : 'salle sans système';
    avertir(`Système deviné (${source}) : ${systeme.id}`);
  }

  // Image : l'URL Firebase Storage est gardée, le fichier n'est pas recopié
  let imageUrl = texte(s.imageUrl) ?? null;
  if (imageUrl && imageUrl.length > LIMITES.imageUrl) {
    avertir(`Image ignorée : URL de plus de ${LIMITES.imageUrl} caractères`);
    imageUrl = null;
  } else if (imageUrl && HEBERGEMENT_FIREBASE.test(imageUrl)) {
    avertir('Image conservée sur Firebase Storage : à recopier avant la fermeture du projet');
  }

  // Joueurs au plus
  const brut = nombre(s.maxPlayers);
  let maxJoueurs: number = LIMITES.maxJoueurs.defaut;
  if (brut === undefined) {
    if (s.maxPlayers !== undefined) avertir(`maxPlayers illisible (${String(s.maxPlayers)}) : 4`);
  } else {
    maxJoueurs = Math.min(
      LIMITES.maxJoueurs.max,
      Math.max(LIMITES.maxJoueurs.min, Math.trunc(brut)),
    );
    if (maxJoueurs !== brut) avertir(`maxPlayers ${brut} ramené à ${maxJoueurs}`);
  }

  // Bannis, membres et rôles
  const proprietaireUid = texte(s.creatorId);
  if (!proprietaireUid) avertir('Salle sans créateur');
  const listeBannis = (Array.isArray(s.bannedUsers) ? s.bannedUsers : []).map(texte);
  const bannis = [...new Set(listeBannis)].filter(
    (uid): uid is string => !!uid && uid !== proprietaireUid,
  );
  if (proprietaireUid && listeBannis.includes(proprietaireUid))
    avertir('Le créateur figurait parmi les bannis : bannissement ignoré');

  const personnagesParId = new Map(a.personnages.map((p) => [p.id, p]));
  const personnagesParNom = new Map<string, DocFirestore<PersonnageLegacy>[]>();
  for (const p of a.personnages) {
    const n = texte(p.data?.Nomperso);
    if (n) personnagesParNom.set(n, [...(personnagesParNom.get(n) ?? []), p]);
  }

  const membres: MembreMigre[] = [];
  for (const m of a.membres) {
    if (bannis.includes(m.uid)) {
      avertir(`Membre ${m.uid} banni : importé comme banni seulement`);
      continue;
    }
    let role: Role = 'joueur';
    if (m.uid === proprietaireUid) role = 'mj';
    else if (m.nom === NOM_MJ) {
      role = 'mj';
      avertir(`Membre ${m.uid} entré comme MJ : importé MJ (co-MJ)`);
    }
    membres.push({ uid: m.uid, role });
  }

  // Personnage incarné : persoId d'abord (plus sûr qu'un nom), puis Noms
  const incarnes = new Set<string>();
  const incarner = (uid: string, p: DocFirestore<PersonnageLegacy>, source: string) => {
    const membre = membres.find((x) => x.uid === uid);
    if (!membre || membre.incarne) return;
    if (incarnes.has(p.path)) {
      avertir(`${p.path} déjà incarné : ignoré pour ${uid} (${source})`);
      return;
    }
    membre.incarne = p.path;
    incarnes.add(p.path);
  };
  for (const m of a.membres) {
    const p = m.persoId ? personnagesParId.get(m.persoId) : undefined;
    if (m.persoId && !p) avertir(`persoId ${m.persoId} de ${m.uid} absent de la salle`);
    if (p) incarner(m.uid, p, 'persoId');
  }
  for (const m of a.membres) {
    if (!m.nom || m.nom === NOM_MJ || membres.find((x) => x.uid === m.uid)?.incarne) continue;
    const candidats = personnagesParNom.get(m.nom) ?? [];
    if (candidats.length === 1) incarner(m.uid, candidats[0]!, 'Noms');
    else if (candidats.length > 1)
      avertir(
        `« ${m.nom} » joué par ${m.uid} : ${candidats.length} personnages de ce nom, aucun incarné`,
      );
    else if (!m.persoId) avertir(`« ${m.nom} » joué par ${m.uid} : personnage introuvable`);
  }

  // Personnages engagés
  const personnages = a.personnages.map((p) => ({
    legacyId: p.path,
    ...(texte(p.data?.Nomperso) ? { nom: texte(p.data?.Nomperso)! } : {}),
    camp: (texte(p.data?.type) === 'joueurs' ? 'joueurs' : 'adversaires') as Camp,
  }));

  // Sessions prévues
  const sessions: SalleMigree['sessions'] = [];
  for (const d of a.sessions) {
    const prevueLe = dateIso(d.data?.date);
    if (prevueLe) sessions.push({ prevueLe });
    else avertir(`Session ${d.id} sans date lisible : ignorée`);
  }
  sessions.sort((x, y) => x.prevueLe.localeCompare(y.prevueLe));

  // Discussion : l'ancienne app n'affichait que les messages avec un texte
  const messages: SalleMigree['messages'] = [];
  let tronques = 0;
  for (const d of a.messages) {
    const m = d.data ?? {};
    let t = texte(m.text);
    if (!t) continue;
    const auteurUid = texte(m.uid);
    const createdAt = dateIso(m.timestamp);
    if (!auteurUid || !createdAt) {
      avertir(`Message ${d.id} sans ${auteurUid ? 'date' : 'auteur'} : ignoré`);
      continue;
    }
    if ([...t].length > LIMITES.message) {
      t = [...t].slice(0, LIMITES.message).join('');
      tronques++;
    }
    messages.push({ auteurUid, texte: t, createdAt });
  }
  if (tronques) avertir(`${tronques} message(s) tronqué(s) à ${LIMITES.message} caractères`);
  messages.sort((x, y) => x.createdAt.localeCompare(y.createdAt));

  return {
    code,
    nom,
    description,
    systemeId: systeme.id,
    imageUrl,
    maxJoueurs,
    publique: booleen(s.isPublic) ?? false,
    creationPersonnages: booleen(s.allowCharacterCreation) ?? true,
    ...(proprietaireUid ? { proprietaireUid } : {}),
    membres,
    bannis,
    personnages,
    sessions,
    messages,
    avertissements,
  };
}
