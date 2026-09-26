/**
 * Personnages en base : lectures, écritures transactionnelles avec
 * concurrence optimiste (`version`) et événement dans l'outbox.
 *
 * Accès (`autoriser`) : le propriétaire a tous les droits ; un membre d'une
 * salle où le personnage est engagé peut le lire, le MJ de cette salle peut
 * aussi le modifier (droits décidés par campaign). Pour tout autre
 * utilisateur, un personnage, ou un personnage supprimé, est introuvable
 * (404) : on ne révèle pas son existence.
 */
import { uuidv7, type ActorRole } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { ficheJson, type EtatEntite, type FicheJson, type SystemeCharge } from '@vtt/rules';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { DroitsSalles } from '../../droits/campaign.js';
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

/** Auteur d'une écriture, repris dans les événements. */
export interface Appelant {
  /** Utilisateur à l'origine de la demande (null : le système). */
  userId: string | null;
  /** `user` pour le propriétaire, `gm` pour le MJ d'une salle, `system` pour un service. */
  role: ActorRole;
  /** Salle concernée, le cas échéant (sujet vtt.<roomId>.character.*). */
  roomId?: string | null;
}

const acteur = (appelant: Appelant, characterId: string) => ({
  userId: appelant.userId,
  role: appelant.role,
  characterId,
});

const salle = (appelant: Appelant) => ({ roomId: appelant.roomId ?? null });

/**
 * - lecture : fiche, étapes de création, achats possibles ;
 * - ecriture : toute modification (MJ de la salle ou propriétaire) ;
 * - proprietaire : suppression, réservée au propriétaire.
 */
export type Mode = 'lecture' | 'ecriture' | 'proprietaire';

/**
 * Vérifie les droits de `userId` sur des personnages actifs. Renvoie le rôle
 * de l'appelant pour les événements : `user` s'il les possède tous, sinon `gm`.
 * Sans droit de lecture : 404 ; lecture seule : 403.
 */
export async function autoriser(
  db: Db | Tx,
  droits: DroitsSalles,
  userId: string,
  demandes: { id: string; mode: Mode }[],
): Promise<ActorRole> {
  const ids = [...new Set(demandes.map((d) => d.id))];
  const proprietaires = await db
    .select({ id: characters.id, ownerId: characters.ownerId })
    .from(characters)
    .where(and(inArray(characters.id, ids), isNull(characters.deletedAt)));
  let role: ActorRole = 'user';
  for (const d of demandes) {
    const ligne = proprietaires.find((l) => l.id === d.id);
    if (!ligne) throw HttpError.notFound('Personnage introuvable');
    if (ligne.ownerId === userId) continue;
    const dr = await droits.de(d.id, userId);
    if (!dr.lecture) throw HttpError.notFound('Personnage introuvable');
    if (d.mode === 'proprietaire')
      throw HttpError.forbidden('Seul le propriétaire peut supprimer ce personnage');
    if (d.mode === 'ecriture') {
      if (!dr.ecriture) throw HttpError.forbidden('Réservé au propriétaire ou au MJ de la salle');
      role = 'gm';
    }
  }
  return role;
}

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

const actif = (id: string) => and(eq(characters.id, id), isNull(characters.deletedAt));

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

/** Personnage actif, sans contrôle d'accès (voir `autoriser`). */
export async function lire(db: Db | Tx, id: string): Promise<Ligne> {
  const [ligne] = await db.select().from(characters).where(actif(id)).limit(1);
  if (!ligne) throw HttpError.notFound('Personnage introuvable');
  return ligne;
}

/**
 * Verrouille des personnages actifs pour la transaction, dans l'ordre des
 * identifiants (deux transactions croisées ne s'interbloquent pas). L'accès
 * est vérifié avant (`autoriser`) : le propriétaire ne change jamais.
 */
export async function verrouiller(tx: Tx, ids: string[]): Promise<Ligne[]> {
  const uniques = [...new Set(ids)];
  const lignes = await tx
    .select()
    .from(characters)
    .where(and(inArray(characters.id, uniques), isNull(characters.deletedAt)))
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
      actor: acteur({ userId: owner, role: 'user' }, id),
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
  appelant: Appelant,
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
    ...salle(appelant),
    actor: acteur(appelant, ligne.id),
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
  appelant: Appelant,
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
    const [ligne] = await verrouiller(tx, [id]);
    verifierVersion(ligne!, version);
    const { changement, operation, details } = calcul(ligne!, systemeDe(catalogue, ligne!));
    return enregistrer(tx, ctx, catalogue, appelant, ligne!, changement, {
      operation,
      ...(details ? { details } : {}),
    });
  });
}

/** Suppression douce : le personnage disparaît de l'API, la ligne reste pour l'historique. */
export async function supprimer(db: Db, ctx: EventContext, appelant: Appelant, id: string) {
  await db.transaction(async (tx) => {
    const [ligne] = await verrouiller(tx, [id]);
    await tx
      .update(characters)
      .set({ deletedAt: sql`now()`, version: ligne!.version + 1, updatedAt: sql`now()` })
      .where(eq(characters.id, id));
    await appendEvent(tx, ctx, {
      type: 'character.deleted',
      ...salle(appelant),
      actor: acteur(appelant, id),
      aggregate: { type: 'character', id },
      payload: { version: ligne!.version + 1 },
    });
  });
}

/** Événement `character.action_resolved` : résultat complet, pour l'historique. */
export async function journaliserAction(
  tx: Tx,
  ctx: EventContext,
  appelant: Appelant,
  acteurId: string,
  payload: Record<string, unknown>,
) {
  await appendEvent(tx, ctx, {
    type: 'character.action_resolved',
    ...salle(appelant),
    actor: acteur(appelant, acteurId),
    aggregate: { type: 'character', id: acteurId },
    payload,
  });
}
