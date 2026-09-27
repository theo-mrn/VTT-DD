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
import { changesPayload, uuidv7, type ActorRole, type DiffOptions } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { EtatEntite, ficheJson, type FicheJson, type SystemeCharge } from '@vtt/rules';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { DroitsCampagnes } from '../../droits/campaign.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { characters, type CharacterDetails, type PendingRoll } from '../../db/schema.js';
import type { Catalogue } from '../../regles/catalogue.js';
import { verifierEtat } from '../../regles/operations.js';
import { summaryOf, type CharacterSummary } from '../../regles/summary.js';
import type { Permissions, SheetLayout } from './layout.js';

export type Ligne = typeof characters.$inferSelect;

/** Présentation libre renvoyée par l'API : les trois champs, vides s'ils manquent. */
export type Details = Required<CharacterDetails>;

export const detailsApi = (d: CharacterDetails | null | undefined): Details => ({
  concept: d?.concept ?? '',
  appearance: d?.appearance ?? '',
  backstory: d?.backstory ?? '',
});

export interface Personnage {
  id: string;
  ownerId: string;
  nom: string;
  avatarUrl: string | null;
  etat: EtatEntite;
  fiche: FicheJson;
  details: Details;
  summary: CharacterSummary;
  /** Mise en page de la fiche ; null : disposition par défaut de la présentation. */
  sheetLayout: SheetLayout | null;
  /** Droits de l'appelant (lecture d'un personnage : `GET /v1/characters/:id`). */
  permissions?: Permissions;
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
  /** Concept du joueur (recherche dans les listes). */
  concept: string;
  summary: CharacterSummary;
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
  droits: DroitsCampagnes,
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

/** Résumé d'un personnage enregistré (fiche recalculée seulement hors cache). */
export function resumeDe(
  catalogue: Catalogue,
  ligne: Pick<Ligne, 'id' | 'version' | 'systemId' | 'etat'>,
): CharacterSummary {
  return summaryOf(
    catalogue,
    ligne,
    () => verifierEtat(systemeDe(catalogue, ligne), ligne.etat).fiche,
  );
}

/** Forme renvoyée par l'API : état enregistré, fiche recalculée, présentation et résumé. */
export function versApi(catalogue: Catalogue, ligne: Ligne): Personnage {
  const { etat, fiche } = verifierEtat(systemeDe(catalogue, ligne), ligne.etat);
  return {
    id: ligne.id,
    ownerId: ligne.ownerId,
    nom: ligne.nom,
    avatarUrl: ligne.avatarUrl,
    etat,
    fiche: ficheJson(fiche),
    details: detailsApi(ligne.details),
    summary: summaryOf(catalogue, ligne, () => fiche),
    sheetLayout: ligne.sheetLayout ?? null,
    version: ligne.version,
    createdAt: ligne.createdAt.toISOString(),
    updatedAt: ligne.updatedAt.toISOString(),
  };
}

const actif = (id: string) => and(eq(characters.id, id), isNull(characters.deletedAt));

export async function lister(
  db: Db,
  catalogue: Catalogue,
  owner: string,
): Promise<ResumePersonnage[]> {
  const lignes = await db
    .select({
      id: characters.id,
      nom: characters.nom,
      avatarUrl: characters.avatarUrl,
      systemId: characters.systemId,
      systemVersion: characters.systemVersion,
      type: characters.type,
      etat: characters.etat,
      version: characters.version,
      concept: sql<string>`coalesce(${characters.details}->>'concept', '')`,
      creation: sql<boolean>`coalesce((${characters.etat}->>'creation')::boolean, false)`,
      updatedAt: characters.updatedAt,
    })
    .from(characters)
    // « Mes personnages » : les personnages joueurs seulement, pas les PNJ
    .where(
      and(eq(characters.ownerId, owner), eq(characters.kind, 'pc'), isNull(characters.deletedAt)),
    )
    .orderBy(desc(characters.updatedAt), desc(characters.id));
  return lignes.map((l) => ({
    id: l.id,
    nom: l.nom,
    avatarUrl: l.avatarUrl,
    systeme: { id: l.systemId, version: l.systemVersion },
    type: l.type,
    creation: l.creation,
    concept: l.concept,
    summary: resumeDe(catalogue, l),
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
  details?: CharacterDetails;
  /** Tirage en attente de répartition ; null l'efface. */
  pendingRoll?: PendingRoll | null;
}

/**
 * Identité des éléments des tableaux de l'état, communs à tous les systèmes
 * (schéma de @vtt/rules) : bonus libres par `id`, possessions par entrée et
 * exemplaire (`etat.possessions[epee-longue#2].quantite`).
 */
export const IDENTITES: DiffOptions = { identityKeys: ['id', ['entree', 'exemplaire']] };

/** Champs suivis par le diff de `character.updated`. */
const suivi = (ligne: Ligne, etat: unknown) => ({
  etat,
  nom: ligne.nom,
  avatarUrl: ligne.avatarUrl,
  details: detailsApi(ligne.details),
});

/**
 * État enregistré avec ses valeurs par défaut (un état importé peut en omettre) :
 * sans cela, le diff rapporterait des champs « ajoutés » qui n'ont pas bougé.
 */
export function etatNormalise(brut: unknown): unknown {
  const r = EtatEntite.safeParse(brut);
  return r.success ? r.data : brut;
}

/**
 * Enregistre un changement sur une ligne verrouillée : l'état est validé et
 * recalculé avant l'écriture, la version incrémentée, l'événement
 * `character.updated` ajouté à l'outbox dans la même transaction. Son payload
 * porte les `details` de l'opération et le diff avant/après (`changes`, voir
 * docs/bus.md) de l'état, du nom et de l'avatar.
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
      ...(changement.details !== undefined ? { details: changement.details } : {}),
      ...(changement.pendingRoll !== undefined ? { pendingRoll: changement.pendingRoll } : {}),
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
    // Écriture dans une campagne (le MJ, un tour de combat) : annoncée aux MJ de la
    // campagne et au propriétaire, qui voient la fiche changer en direct ; jamais aux
    // autres joueurs (le diff peut porter des valeurs réservées au MJ)
    ...(appelant.roomId ? { visibility: 'gm_only' as const } : {}),
    actor: acteur(appelant, ligne.id),
    aggregate: { type: 'character', id: ligne.id },
    payload: {
      version: suivante.version,
      operation: evenement.operation,
      ...(appelant.roomId ? { visibleToUsers: [ligne.ownerId] } : {}),
      ...evenement.details,
      ...changesPayload(
        suivi(ligne, etatNormalise(ligne.etat)),
        suivi(suivante, etatNormalise(suivante.etat)),
        IDENTITES,
      ),
    },
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

/**
 * Change la mise en page de la fiche (null : retour à la disposition par défaut), avec
 * la version connue, et annonce `character.layout_changed` à chaque table où le personnage
 * est engagé (`campagnes`, publique : la table voit la même fiche) ; hors campagne,
 * à l'auteur seul. La mise en page appartient au personnage : sa version est incrémentée
 * comme pour toute écriture.
 */
export async function changerMiseEnPage(
  db: Db,
  ctx: EventContext,
  appelant: Appelant,
  campagnes: readonly string[],
  id: string,
  version: number,
  layout: SheetLayout | null,
): Promise<Ligne> {
  return db.transaction(async (tx) => {
    const [ligne] = await verrouiller(tx, [id]);
    verifierVersion(ligne!, version);
    const [suivante] = await tx
      .update(characters)
      .set({ sheetLayout: layout, version: ligne!.version + 1, updatedAt: sql`now()` })
      .where(and(eq(characters.id, id), eq(characters.version, ligne!.version)))
      .returning();
    if (!suivante)
      throw HttpError.conflict('Le personnage a été modifié entre-temps', 'version_perimee');
    const salles = campagnes.length ? [...new Set(campagnes)] : [null];
    for (const roomId of salles)
      await appendEvent(tx, ctx, {
        type: 'character.layout_changed',
        roomId,
        visibility: roomId ? 'public' : 'owner',
        actor: acteur(appelant, id),
        aggregate: { type: 'character', id },
        payload: {
          version: suivante.version,
          reset: layout === null,
          blocks: layout?.blocks.length ?? 0,
        },
      });
    return suivante;
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
