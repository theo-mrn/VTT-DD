/**
 * Chargement des salles migrées dans la base du service.
 *
 * `preparerSalle` (pure) traduit les UID Firebase en comptes migrés
 * (identity.legacy_ids) et les chemins des personnages en personnages importés
 * (characters.legacy_ids) ; ce qui n'a pas de correspondance est écarté avec un
 * avertissement. `chargerSalle` écrit ensuite la salle dans une transaction avec
 * son événement `room.created` (acteur système). Rejouable : une salle déjà
 * importée (même chemin legacy dans `legacy_ids`) est ignorée.
 */
import { uuidv7 } from '@vtt/contracts';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent } from '../db/outbox.js';
import {
  legacyIds,
  roomBans,
  roomCharacters,
  roomMembers,
  roomMessages,
  rooms,
  roomSessions,
  type Camp,
  type Role,
} from '../db/schema.js';
import { nouveauCodeSalle } from '../modules/salles/code.js';
import type { SalleMigree } from './transformer.js';

export const SOURCE_LEGACY = 'firebase';

/** Personnage importé par character, retrouvé par son chemin legacy. */
export interface PersonnageImporte {
  id: string;
  ownerId: string;
  systemId: string;
}

export interface Correspondances {
  /** UID Firebase → compte migré. */
  comptes: ReadonlyMap<string, string>;
  /** `cartes/{code}/characters/{id}` → personnage importé. */
  personnages: ReadonlyMap<string, PersonnageImporte>;
}

/** Lignes à écrire pour une salle, identifiants traduits. */
export interface SallePreparee {
  salle: Omit<typeof rooms.$inferInsert, 'id' | 'code'> & { code: string | null };
  membres: { userId: string; role: Role }[];
  bannis: string[];
  personnages: {
    characterId: string;
    ownerId: string;
    camp: Camp;
    incarnePar: string | null;
  }[];
  sessions: { prevueLe: Date }[];
  messages: { auteurId: string; texte: string; createdAt: Date }[];
}

export type Preparation =
  | { statut: 'pret'; salle: SallePreparee; avertissements: string[] }
  | { statut: 'sans-compte'; avertissements: string[] };

export function preparerSalle(
  m: SalleMigree,
  c: Correspondances,
  systemVersion: string,
): Preparation {
  const avertissements = [...m.avertissements];
  const avertir = (a: string) => avertissements.push(a);
  const compte = (uid: string | undefined) => (uid ? c.comptes.get(uid) : undefined);

  // Propriétaire : le créateur, à défaut un autre MJ avec un compte migré
  let proprietaire = compte(m.proprietaireUid);
  if (!proprietaire) {
    const relais = m.membres.find((x) => x.role === 'mj' && compte(x.uid));
    if (!relais) {
      avertir(`Créateur ${m.proprietaireUid ?? '(inconnu)'} sans compte migré : salle ignorée`);
      return { statut: 'sans-compte', avertissements };
    }
    proprietaire = compte(relais.uid)!;
    avertir(
      `Créateur ${m.proprietaireUid ?? '(inconnu)'} sans compte migré : salle confiée à ${relais.uid}`,
    );
  }

  // Membres (le propriétaire est toujours MJ)
  const membres = new Map<string, Role>([[proprietaire, 'mj']]);
  const compteDe = new Map<string, string>(); // uid → compte, membres retenus
  for (const x of m.membres) {
    const id = compte(x.uid);
    if (!id) {
      avertir(`Membre ${x.uid} sans compte migré : ignoré`);
      continue;
    }
    compteDe.set(x.uid, id);
    if (!membres.has(id)) membres.set(id, x.role);
  }

  // Bannis
  const bannis: string[] = [];
  for (const uid of m.bannis) {
    const id = compte(uid);
    if (!id) avertir(`Banni ${uid} sans compte migré : ignoré`);
    else if (!membres.has(id) && !bannis.includes(id)) bannis.push(id);
  }

  // Personnages engagés, du système de la salle
  const engages = new Map<string, SallePreparee['personnages'][number]>(); // chemin legacy → ligne
  for (const p of m.personnages) {
    const importe = c.personnages.get(p.legacyId);
    const libelle = p.nom ? `« ${p.nom} » (${p.legacyId})` : p.legacyId;
    if (!importe) {
      avertir(`Personnage non importé : ${libelle}`);
      continue;
    }
    if (importe.systemId !== m.systemeId) {
      avertir(
        `Personnage ${libelle} du système ${importe.systemId}, salle ${m.systemeId} : non engagé`,
      );
      continue;
    }
    engages.set(p.legacyId, {
      characterId: importe.id,
      ownerId: importe.ownerId,
      camp: p.camp,
      incarnePar: null,
    });
  }

  // Personnage incarné : engagé, et à soi pour un joueur (le MJ incarne n'importe lequel)
  for (const x of m.membres) {
    const id = compteDe.get(x.uid);
    if (!x.incarne || !id) continue;
    const ligne = engages.get(x.incarne);
    const role = membres.get(id)!;
    if (!ligne) avertir(`${x.incarne}, incarné par ${x.uid}, n'est pas engagé : non incarné`);
    else if (role !== 'mj' && ligne.ownerId !== id)
      avertir(`${x.incarne} appartient à un autre compte que ${x.uid} : non incarné`);
    else if ([...engages.values()].some((l) => l.incarnePar === id))
      avertir(`${x.uid} incarne déjà un personnage : ${x.incarne} non incarné`);
    else ligne.incarnePar = id;
  }

  // Discussion : auteurs sans compte regroupés
  const messages: SallePreparee['messages'] = [];
  const sansAuteur = new Map<string, number>();
  for (const msg of m.messages) {
    const auteurId = compte(msg.auteurUid);
    if (auteurId) messages.push({ auteurId, texte: msg.texte, createdAt: new Date(msg.createdAt) });
    else sansAuteur.set(msg.auteurUid, (sansAuteur.get(msg.auteurUid) ?? 0) + 1);
  }
  for (const [uid, n] of sansAuteur)
    avertir(`${n} message(s) de ${uid} (sans compte migré) ignoré(s)`);

  return {
    statut: 'pret',
    avertissements,
    salle: {
      salle: {
        nom: m.nom,
        description: m.description,
        systemId: m.systemeId,
        systemVersion,
        ownerId: proprietaire,
        code: m.code,
        imageUrl: m.imageUrl,
        maxJoueurs: m.maxJoueurs,
        publique: m.publique,
        creationPersonnages: m.creationPersonnages,
      },
      membres: [...membres].map(([userId, role]) => ({ userId, role })),
      bannis,
      personnages: [...engages.values()],
      sessions: m.sessions.map((s) => ({ prevueLe: new Date(s.prevueLe) })),
      messages,
    },
  };
}

export type ResultatChargement =
  | { statut: 'importe'; id: string; code: string; avertissements: string[] }
  | { statut: 'deja-importe'; id: string };

/** Salle déjà importée sous ce chemin legacy, le cas échéant. */
export async function dejaImportee(db: Db, legacyId: string): Promise<string | undefined> {
  const [existant] = await db
    .select({ id: legacyIds.roomId })
    .from(legacyIds)
    .where(and(eq(legacyIds.source, SOURCE_LEGACY), eq(legacyIds.legacyId, legacyId)));
  return existant?.id;
}

const ESSAIS_CODE = 5;
const PAQUET = 500;

/** Insertions par paquets : une salle peut avoir des milliers de messages. */
async function parPaquets<T>(lignes: T[], ecrire: (paquet: T[]) => Promise<unknown>) {
  for (let i = 0; i < lignes.length; i += PAQUET) await ecrire(lignes.slice(i, i + PAQUET));
}

export async function chargerSalle(
  db: Db,
  p: SallePreparee,
  legacyId: string,
  correlationId: string,
): Promise<ResultatChargement> {
  const existant = await dejaImportee(db, legacyId);
  if (existant) return { statut: 'deja-importe', id: existant };

  const avertissements: string[] = [];
  const id = uuidv7();
  const code = await db.transaction(async (tx) => {
    // Code legacy déjà pris (par une salle créée depuis) : on en tire un autre
    let code: string | undefined;
    for (let essai = 0; !code && essai <= ESSAIS_CODE; essai++) {
      const candidat = essai === 0 && p.salle.code ? p.salle.code : nouveauCodeSalle();
      const [salle] = await tx
        .insert(rooms)
        .values({ ...p.salle, id, code: candidat })
        .onConflictDoNothing({ target: rooms.code })
        .returning({ code: rooms.code });
      code = salle?.code;
    }
    if (!code) throw new Error('Aucun code de salle libre après plusieurs essais');
    if (p.salle.code && code !== p.salle.code)
      avertissements.push(`Code ${p.salle.code} déjà pris : nouveau code ${code}`);

    await tx.insert(roomMembers).values(p.membres.map((m) => ({ roomId: id, ...m })));
    if (p.bannis.length)
      await tx
        .insert(roomBans)
        .values(p.bannis.map((userId) => ({ roomId: id, userId, banniPar: p.salle.ownerId })));
    await parPaquets(p.personnages, (paquet) =>
      tx
        .insert(roomCharacters)
        .values(paquet.map((x) => ({ roomId: id, ...x, ajoutePar: x.ownerId }))),
    );
    await parPaquets(p.sessions, (paquet) =>
      tx.insert(roomSessions).values(
        paquet.map((s) => ({
          id: uuidv7(s.prevueLe.getTime()),
          roomId: id,
          prevueLe: s.prevueLe,
          creePar: p.salle.ownerId,
        })),
      ),
    );
    // Id UUIDv7 à la date d'envoi : l'ordre de la discussion est conservé
    await parPaquets(p.messages, (paquet) =>
      tx
        .insert(roomMessages)
        .values(paquet.map((m) => ({ id: uuidv7(m.createdAt.getTime()), roomId: id, ...m }))),
    );
    await tx.insert(legacyIds).values({ source: SOURCE_LEGACY, legacyId, roomId: id });
    await appendEvent(
      tx,
      { correlationId },
      {
        type: 'room.created',
        roomId: id,
        actor: { userId: null, role: 'system', characterId: null },
        aggregate: { type: 'room', id },
        payload: {
          nom: p.salle.nom,
          code,
          publique: p.salle.publique ?? false,
          systeme: { id: p.salle.systemId, version: p.salle.systemVersion },
          importe: true,
        },
      },
    );
    return code;
  });
  return { statut: 'importe', id, code, avertissements };
}
