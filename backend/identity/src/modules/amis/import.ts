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
  const rapport = {
    amities: 0,
    amitiesDejaPresentes: 0,
    demandes: 0,
    demandesDejaPresentes: 0,
    demandesEntreAmis: 0,
    comptesAbsents: 0,
    cheminsInvalides: 0,
    erreurs: 0,
  };

  const uuid = (uid: string) => entrees.uuidParUid.get(uid);

  // Déduplication en mémoire : A->B et B->A sont la même amitié
  const amities = new Map<string, { userA: string; userB: string; createdAt: Date | null }>();
  for (const doc of entrees.amities) {
    const lien = lienDepuisChemin(doc.path);
    if (lien?.type !== 'amitie' || lien.uid === lien.autreUid) {
      rapport.cheminsInvalides++;
      continue;
    }
    const x = uuid(lien.uid);
    const y = uuid(lien.autreUid);
    if (!x || !y) {
      rapport.comptesAbsents++;
      continue;
    }
    const p = paire(x, y);
    const k = cle(p.userA, p.userB);
    const date = dateDuDocument(doc.data);
    const deja = amities.get(k);
    if (!deja) amities.set(k, { ...p, createdAt: date });
    else if (date && (!deja.createdAt || date < deja.createdAt)) deja.createdAt = date;
  }

  const demandes = new Map<string, { fromUser: string; toUser: string; createdAt: Date | null }>();
  for (const doc of entrees.demandes) {
    const lien = lienDepuisChemin(doc.path);
    if (lien?.type !== 'demande' || lien.deUid === lien.versUid) {
      rapport.cheminsInvalides++;
      continue;
    }
    const de = uuid(lien.deUid);
    const vers = uuid(lien.versUid);
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
    const k = cle(de, vers);
    const date = dateDuDocument(doc.data);
    const deja = demandes.get(k);
    if (!deja) demandes.set(k, { fromUser: de, toUser: vers, createdAt: date });
    else if (date && (!deja.createdAt || date < deja.createdAt)) deja.createdAt = date;
  }

  const systeme = { userId: null, role: 'system' as const, characterId: null };

  for (const a of amities.values()) {
    try {
      const cree = await db.transaction(async (tx) => {
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
          actor: systeme,
          aggregate: { type: 'user', id: a.userA },
          visibility: 'owner',
          payload: { source: 'firebase', friendId: a.userB },
        });
        return true;
      });
      if (cree) rapport.amities++;
      else rapport.amitiesDejaPresentes++;
    } catch {
      rapport.erreurs++;
    }
  }

  for (const d of demandes.values()) {
    try {
      const cree = await db.transaction(async (tx) => {
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
          actor: systeme,
          aggregate: { type: 'user', id: d.fromUser },
          visibility: 'owner',
          payload: { source: 'firebase', toUserId: d.toUser },
        });
        return true;
      });
      if (cree) rapport.demandes++;
      else rapport.demandesDejaPresentes++;
    } catch {
      rapport.erreurs++;
    }
  }

  return rapport;
}
