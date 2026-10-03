/**
 * Import des amis Firebase (structure de legacy/src/hooks/useFriends.ts) :
 * - friendships/{uid}/friends/{amiUid} : chaque amitié y figure dans les deux
 *   sens ; une seule ligne (paire ordonnée) est créée ;
 * - requests/{uid}/received/{deUid} : demande de deUid vers uid ;
 * - requests/{uid}/sent/{versUid}   : demande de uid vers versUid.
 * Les données des documents (nom, titre, photo copiés) ne sont pas reprises :
 * elles viennent désormais du profil. Rejouable (ON CONFLICT DO NOTHING).
 */
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { friendRequests, friendships } from '../../db/schema.js';
import type { DocFirestore } from '../titres/import.js';
import { paire } from './service.js';

export type LienFirebase =
  | { type: 'amitie'; uid: string; autreUid: string }
  | { type: 'demande'; deUid: string; versUid: string };

/** Interprète le chemin d'un document ; null s'il ne correspond à aucune forme connue. */
export function lienDepuisChemin(path: string): LienFirebase | null {
  const s = path.split('/');
  if (s.length !== 4 || s.some((x) => !x)) return null;
  const [collection, uid, sous, autre] = s as [string, string, string, string];
  if (collection === 'friendships' && sous === 'friends') {
    return { type: 'amitie', uid, autreUid: autre };
  }
  if (collection === 'requests' && sous === 'received') {
    return { type: 'demande', deUid: autre, versUid: uid };
  }
  if (collection === 'requests' && sous === 'sent') {
    return { type: 'demande', deUid: uid, versUid: autre };
  }
  return null;
}

/** Date d'un champ Firestore balisé { "$timestamp": "…" } (ou chaîne ISO), sinon null. */
export function dateFirestore(valeur: unknown): Date | null {
  const brut =
    typeof valeur === 'object' && valeur !== null && '$timestamp' in valeur
      ? (valeur as { $timestamp: unknown }).$timestamp
      : valeur;
  if (typeof brut !== 'string') return null;
  const d = new Date(brut);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateDuDocument(data: Record<string, unknown>): Date | null {
  return dateFirestore(data.createdAt) ?? dateFirestore(data.timestamp);
}

const cle = (a: string, b: string) => `${a}|${b}`;

type RapportAmis = {
  amities: number;
  amitiesDejaPresentes: number;
  demandes: number;
  demandesDejaPresentes: number;
  demandesEntreAmis: number;
  comptesAbsents: number;
  cheminsInvalides: number;
  erreurs: number;
};

type EntreesAmis = Parameters<typeof importerAmis>[2];
type Amitie = { userA: string; userB: string; createdAt: Date | null };
type Demande = { fromUser: string; toUser: string; createdAt: Date | null };

const SYSTEME = { userId: null, role: 'system' as const, characterId: null };

/** Ajoute un lien, ou garde la date la plus ancienne s'il est déjà vu. */
function garderPlusAncien<T extends { createdAt: Date | null }>(
  liens: Map<string, T>,
  k: string,
  lien: T,
): void {
  const deja = liens.get(k);
  const date = lien.createdAt;
  if (!deja) liens.set(k, lien);
  else if (date && (!deja.createdAt || date < deja.createdAt)) deja.createdAt = date;
}

/** Amitiés dédupliquées en mémoire : A->B et B->A sont la même amitié. */
function amitiesUniques(entrees: EntreesAmis, rapport: RapportAmis): Map<string, Amitie> {
  const amities = new Map<string, Amitie>();
  for (const doc of entrees.amities) {
    const lien = lienDepuisChemin(doc.path);
    if (lien?.type !== 'amitie' || lien.uid === lien.autreUid) {
      rapport.cheminsInvalides++;
      continue;
    }
    const x = entrees.uuidParUid.get(lien.uid);
    const y = entrees.uuidParUid.get(lien.autreUid);
    if (!x || !y) {
      rapport.comptesAbsents++;
      continue;
    }
    const p = paire(x, y);
    garderPlusAncien(amities, cle(p.userA, p.userB), { ...p, createdAt: dateDuDocument(doc.data) });
  }
  return amities;
}

/** Demandes en attente, sans celles entre amis (reste d'une demande acceptée). */
function demandesEnAttente(
  entrees: EntreesAmis,
  amities: Map<string, Amitie>,
  rapport: RapportAmis,
): Map<string, Demande> {
  const demandes = new Map<string, Demande>();
  for (const doc of entrees.demandes) {
    const lien = lienDepuisChemin(doc.path);
    if (lien?.type !== 'demande' || lien.deUid === lien.versUid) {
      rapport.cheminsInvalides++;
      continue;
    }
    const de = entrees.uuidParUid.get(lien.deUid);
    const vers = entrees.uuidParUid.get(lien.versUid);
    if (!de || !vers) {
      rapport.comptesAbsents++;
      continue;
    }
    const p = paire(de, vers);
    if (amities.has(cle(p.userA, p.userB))) {
      // Reste d'une demande acceptée : l'amitié suffit
      rapport.demandesEntreAmis++;
      continue;
    }
    garderPlusAncien(demandes, cle(de, vers), {
      fromUser: de,
      toUser: vers,
      createdAt: dateDuDocument(doc.data),
    });
  }
  return demandes;
}

/** Insère une amitié et son événement ; faux si elle existait déjà. */
async function insererAmitie(db: Db, ctx: EventContext, a: Amitie): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inseres = await tx
      .insert(friendships)
      .values({
        userA: a.userA,
        userB: a.userB,
        ...(a.createdAt && { createdAt: a.createdAt }),
      })
      .onConflictDoNothing()
      .returning({ a: friendships.userA });
    if (!inseres.length) return false;
    await appendEvent(tx, ctx, {
      type: 'identity.friendship_imported',
      actor: SYSTEME,
      aggregate: { type: 'user', id: a.userA },
      visibility: 'owner',
      payload: { source: 'firebase', friendId: a.userB },
    });
    return true;
  });
}

/** Insère une demande et son événement ; faux si elle existait déjà. */
async function insererDemande(db: Db, ctx: EventContext, d: Demande): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inseres = await tx
      .insert(friendRequests)
      .values({
        fromUser: d.fromUser,
        toUser: d.toUser,
        ...(d.createdAt && { createdAt: d.createdAt }),
      })
      .onConflictDoNothing()
      .returning({ from: friendRequests.fromUser });
    if (!inseres.length) return false;
    await appendEvent(tx, ctx, {
      type: 'identity.friend_request_imported',
      actor: SYSTEME,
      aggregate: { type: 'user', id: d.fromUser },
      visibility: 'owner',
      payload: { source: 'firebase', toUserId: d.toUser },
    });
    return true;
  });
}

/**
 * Importe les amitiés (friendships/{uid}/friends/{amiUid}) et les demandes en
 * attente (requests/{uid}/received/{deUid}, requests/{uid}/sent/{versUid}). Rejouable.
 * (Contrat figé : implémenté par le module amis, appelé par import/cli.ts.)
 */
export async function importerAmis(
  db: Db,
  ctx: EventContext,
  entrees: {
    amities: DocFirestore[];
    demandes: DocFirestore[];
    uuidParUid: ReadonlyMap<string, string>;
  },
): Promise<Record<string, number>> {
  const rapport: RapportAmis = {
    amities: 0,
    amitiesDejaPresentes: 0,
    demandes: 0,
    demandesDejaPresentes: 0,
    demandesEntreAmis: 0,
    comptesAbsents: 0,
    cheminsInvalides: 0,
    erreurs: 0,
  };

  const amities = amitiesUniques(entrees, rapport);
  const demandes = demandesEnAttente(entrees, amities, rapport);

  for (const a of amities.values()) {
    try {
      if (await insererAmitie(db, ctx, a)) rapport.amities++;
      else rapport.amitiesDejaPresentes++;
    } catch {
      rapport.erreurs++;
    }
  }

  for (const d of demandes.values()) {
    try {
      if (await insererDemande(db, ctx, d)) rapport.demandes++;
      else rapport.demandesDejaPresentes++;
    } catch {
      rapport.erreurs++;
    }
  }

  return rapport;
}
