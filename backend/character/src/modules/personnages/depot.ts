/**
 * Personnages en base : lecture par propriétaire, écritures transactionnelles
 * avec concurrence optimiste (`version`) et événement dans l'outbox.
 *
 * Un personnage d'un autre utilisateur, ou supprimé, est introuvable (404) :
 * on ne révèle pas son existence.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { ficheJson, type EtatEntite, type FicheJson, type SystemeCharge } from '@vtt/rules';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { characters } from '../../db/schema.js';
import type { Catalogue } from '../../regles/catalogue.js';
import { verifierEtat } from '../../regles/operations.js';

export type Ligne = typeof characters.$inferSelect;

export interface Personnage {
  id: string;
  ownerId: string;
  nom: string;
  avatarUrl: string | null;
  etat: EtatEntite;
  fiche: FicheJson;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResumePersonnage {
  id: string;
  nom: string;
  avatarUrl: string | null;
  systeme: { id: string; version: string };
  type: string;
  creation: boolean;
  updatedAt: string;
}

const acteur = (userId: string, characterId: string) => ({
  userId,
  role: 'user' as const,
  characterId,
});

/** Système d'un personnage enregistré (introuvable : données incohérentes, erreur 500). */
export function systemeDe(catalogue: Catalogue, ligne: Pick<Ligne, 'systemId'>): SystemeCharge {
  const s = catalogue.charge(ligne.systemId);
  if (!s) throw new Error(`Système ${ligne.systemId} absent du catalogue`);
  return s;
}

/** Forme renvoyée par l'API : état enregistré et fiche recalculée. */
export function versApi(catalogue: Catalogue, ligne: Ligne): Personnage {
  const { etat, fiche } = verifierEtat(systemeDe(catalogue, ligne), ligne.etat);
  return {
    id: ligne.id,
    ownerId: ligne.ownerId,
    nom: ligne.nom,
    avatarUrl: ligne.avatarUrl,
    etat,
    fiche: ficheJson(fiche),
    version: ligne.version,
    createdAt: ligne.createdAt.toISOString(),
    updatedAt: ligne.updatedAt.toISOString(),
  };
}

const actif = (owner: string, id: string) =>
  and(eq(characters.id, id), eq(characters.ownerId, owner), isNull(characters.deletedAt));

export async function lister(db: Db, owner: string): Promise<ResumePersonnage[]> {
  const lignes = await db
    .select({
      id: characters.id,
      nom: characters.nom,
      avatarUrl: characters.avatarUrl,
      systemId: characters.systemId,
      systemVersion: characters.systemVersion,
      type: characters.type,
      creation: sql<boolean>`coalesce((${characters.etat}->>'creation')::boolean, false)`,
      updatedAt: characters.updatedAt,
    })
    .from(characters)
    .where(and(eq(characters.ownerId, owner), isNull(characters.deletedAt)))
    .orderBy(desc(characters.updatedAt), desc(characters.id));
  return lignes.map((l) => ({
    id: l.id,
    nom: l.nom,
    avatarUrl: l.avatarUrl,
    systeme: { id: l.systemId, version: l.systemVersion },
    type: l.type,
    creation: l.creation,
    updatedAt: l.updatedAt.toISOString(),
  }));
}

export async function lire(db: Db | Tx, owner: string, id: string): Promise<Ligne> {
  const [ligne] = await db.select().from(characters).where(actif(owner, id)).limit(1);
  if (!ligne) throw HttpError.notFound('Personnage introuvable');
  return ligne;
}

/**
 * Verrouille des personnages du propriétaire pour la transaction, dans l'ordre
 * des identifiants (deux transactions croisées ne s'interbloquent pas).
 */
export async function verrouiller(tx: Tx, owner: string, ids: string[]): Promise<Ligne[]> {
  const uniques = [...new Set(ids)];
  const lignes = await tx
    .select()
    .from(characters)
    .where(
      and(
        inArray(characters.id, uniques),
        eq(characters.ownerId, owner),
        isNull(characters.deletedAt),
      ),
    )
    .orderBy(characters.id)
    .for('update');
  if (lignes.length !== uniques.length) throw HttpError.notFound('Personnage introuvable');
  return ids.map((id) => lignes.find((l) => l.id === id)!);
}

export function verifierVersion(ligne: Ligne, version: number | undefined) {
  if (version !== undefined && version !== ligne.version) {
    throw HttpError.conflict(
      `Le personnage a été modifié entre-temps (version ${ligne.version}, reçue ${version}) : ` +
        'relisez-le puis réessayez',
      'version_perimee',
    );
  }
}

export async function creer(
  db: Db,
  ctx: EventContext,
  owner: string,
  donnees: { nom: string; etat: EtatEntite },
): Promise<Ligne> {
  const id = uuidv7();
  return db.transaction(async (tx) => {
    const [ligne] = await tx
      .insert(characters)
      .values({
        id,
        ownerId: owner,
        nom: donnees.nom,
        systemId: donnees.etat.systeme.id,
        systemVersion: donnees.etat.systeme.version,
        type: donnees.etat.type,
        etat: donnees.etat,
      })
      .returning();
    await appendEvent(tx, ctx, {
      type: 'character.created',
      actor: acteur(owner, id),
      aggregate: { type: 'character', id },
      payload: {
        version: 1,
        nom: donnees.nom,
        systeme: donnees.etat.systeme,
        type: donnees.etat.type,
      },
    });
    return ligne!;
  });
}

export interface Changement {
  etat?: EtatEntite;
  nom?: string;
  avatarUrl?: string | null;
}

/**
 * Enregistre un changement sur une ligne verrouillée : l'état est validé et
 * recalculé avant l'écriture, la version incrémentée, l'événement
 * `character.updated` ajouté à l'outbox dans la même transaction.
 */
export async function enregistrer(
  tx: Tx,
  ctx: EventContext,
  catalogue: Catalogue,
  owner: string,
  ligne: Ligne,
  changement: Changement,
  evenement: { operation: string; details?: Record<string, unknown> },
): Promise<Ligne> {
  const etat = changement.etat
    ? verifierEtat(systemeDe(catalogue, ligne), changement.etat).etat
    : undefined;
  const [suivante] = await tx
    .update(characters)
    .set({
      ...(etat ? { etat, systemVersion: etat.systeme.version, type: etat.type } : {}),
      ...(changement.nom !== undefined ? { nom: changement.nom } : {}),
      ...(changement.avatarUrl !== undefined ? { avatarUrl: changement.avatarUrl } : {}),
      version: ligne.version + 1,
      updatedAt: sql`now()`,
    })
    // Garde-fou : la ligne est verrouillée, la version ne peut pas avoir bougé
    .where(and(eq(characters.id, ligne.id), eq(characters.version, ligne.version)))
    .returning();
  if (!suivante)
    throw HttpError.conflict('Le personnage a été modifié entre-temps', 'version_perimee');
  await appendEvent(tx, ctx, {
    type: 'character.updated',
    actor: acteur(owner, ligne.id),
    aggregate: { type: 'character', id: ligne.id },
    payload: { version: suivante.version, operation: evenement.operation, ...evenement.details },
  });
  return suivante;
}

/**
 * Lit le personnage, vérifie la version envoyée, calcule le changement et
 * l'enregistre, le tout dans une transaction.
 */
export async function modifier(
  db: Db,
  ctx: EventContext,
  catalogue: Catalogue,
  owner: string,
  id: string,
  version: number | undefined,
  calcul: (
    ligne: Ligne,
    systeme: SystemeCharge,
  ) => {
    changement: Changement;
    operation: string;
    details?: Record<string, unknown>;
  },
): Promise<Ligne> {
  return db.transaction(async (tx) => {
    const [ligne] = await verrouiller(tx, owner, [id]);
    verifierVersion(ligne!, version);
    const { changement, operation, details } = calcul(ligne!, systemeDe(catalogue, ligne!));
    return enregistrer(tx, ctx, catalogue, owner, ligne!, changement, {
      operation,
      ...(details ? { details } : {}),
    });
  });
}

/** Suppression douce : le personnage disparaît de l'API, la ligne reste pour l'historique. */
export async function supprimer(db: Db, ctx: EventContext, owner: string, id: string) {
  await db.transaction(async (tx) => {
    const [ligne] = await verrouiller(tx, owner, [id]);
    await tx
      .update(characters)
      .set({ deletedAt: sql`now()`, version: ligne!.version + 1, updatedAt: sql`now()` })
      .where(eq(characters.id, id));
    await appendEvent(tx, ctx, {
      type: 'character.deleted',
      actor: acteur(owner, id),
      aggregate: { type: 'character', id },
      payload: { version: ligne!.version + 1 },
    });
  });
}

/** Événement `character.action_resolved` : résultat complet, pour l'historique. */
export async function journaliserAction(
  tx: Tx,
  ctx: EventContext,
  owner: string,
  acteurId: string,
  payload: Record<string, unknown>,
) {
  await appendEvent(tx, ctx, {
    type: 'character.action_resolved',
    actor: acteur(owner, acteurId),
    aggregate: { type: 'character', id: acteurId },
    payload,
  });
}
