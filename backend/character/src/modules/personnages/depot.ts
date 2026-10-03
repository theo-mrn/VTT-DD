/**
 * Personnages en base : lectures, écritures transactionnelles avec
 * concurrence optimiste (`version`) et événement dans l'outbox.
 *
 * Accès (`acces`, `autoriser`) : un seul personnage actif, pas de possession.
 * Engagé dans une campagne, un personnage s'écrit par le membre qui l'incarne
 * et par le MJ ; les autres membres le lisent, son propriétaire compris s'il ne
 * l'incarne pas. La fiche d'un PNJ ennemi se lit par le MJ et les joueurs de la campagne
 * (l'attaque se calcule chez l'attaquant, docs/combat.md § 9.1), pas par les spectateurs. Son propriétaire garde
 * la main hors campagne (jamais engagé) et pendant la création, et seul il le supprime.
 * Pour tout autre utilisateur, un personnage, ou un personnage supprimé, est
 * introuvable (404) : on ne révèle pas son existence.
 */
import {
  type PortraitStudio,
  changesPayload,
  TRASH_DAYS,
  uuidv7,
  type ActorRole,
  type DiffOptions,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import {
  avecOptions,
  EtatEntite,
  ficheJson,
  type FicheJson,
  type ReglagesOptions,
  type SystemeCharge,
} from '@vtt/rules';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { campaignIndisponible, type Droits, type DroitsCampagnes } from '../../droits/campaign.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { characters, type CharacterDetails, type PendingRoll } from '../../db/schema.js';
import type { Catalogue } from '../../regles/catalogue.js';
import { verifierEtat, verifierInventaire, vuePublique } from '../../regles/operations.js';
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
  /** Token fabriqué par le Studio du portrait ; null : le portrait sert de token. */
  tokenUrl: string | null;
  /** Réglages du Studio du portrait (docs/portraits.md). */
  portraitStudio: PortraitStudio | null;
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
  /**
   * `user` pour qui a la main sur le personnage (le joueur qui l'incarne, son
   * propriétaire hors campagne ou en création), `gm` pour le MJ d'une salle,
   * `system` pour un service.
   */
  role: ActorRole;
  /** Salle concernée, le cas échéant (sujet vtt.<roomId>.character.*). */
  roomId?: string | null;
  /**
   * Membre qui incarne le personnage dans `roomId` : une écriture du MJ lui est
   * annoncée en direct (`visibleToUsers`), comme au propriétaire pendant la création.
   */
  joueur?: string | null;
}

const acteur = (appelant: Appelant, characterId: string) => ({
  userId: appelant.userId,
  role: appelant.role,
  characterId,
});

const salle = (appelant: Appelant) => ({ roomId: appelant.roomId ?? null });

/**
 * - lecture : fiche, étapes de création, achats possibles ;
 * - ecriture : toute modification (joueur qui l'incarne, MJ de la salle, propriétaire
 *   hors campagne ou en création) ;
 * - proprietaire : suppression, réservée au propriétaire.
 */
export type Mode = 'lecture' | 'ecriture' | 'proprietaire';

/** Création en cours (`etat.creation`), lue sans charger l'état. */
const enCreation = sql<boolean>`coalesce((${characters.etat}->>'creation')::boolean, false)`;

/** Ce qu'un utilisateur peut faire d'un personnage. */
export interface Acces {
  lecture: boolean;
  ecriture: boolean;
  /** Rôle de ses écritures dans les événements (voir `Appelant.role`). */
  role: ActorRole;
  /** Réponse de campaign ; absente pour le propriétaire en création (pas interrogé). */
  droits?: Droits;
}

/**
 * Accès de `userId` au personnage `ligne` :
 *  - pendant la création, son propriétaire a la main (sans interroger campaign) ;
 *  - jamais engagé dans une campagne, son propriétaire aussi ;
 *  - engagé : le membre qui l'incarne et le MJ écrivent, les membres lisent, le
 *    propriétaire lit toujours (même s'il ne siège plus à la table) ;
 *  - un PNJ ne se lit, pour qui ne l'écrit pas, que s'il est du camp des joueurs ou allié
 *    dans une des campagnes du lecteur, ou si le lecteur y est joueur (il peut l'attaquer) :
 *    la fiche d'un ennemi reste fermée aux spectateurs.
 * campaign en panne : le propriétaire garde la lecture, personne n'écrit
 * (`droits.indisponible`, 503 à l'écriture). `frais` : droits relus sans cache.
 */
export async function acces(
  droits: DroitsCampagnes,
  userId: string,
  ligne: { id: string; ownerId: string; creation: boolean; kind?: 'pc' | 'npc' },
  o: { frais?: boolean } = {},
): Promise<Acces> {
  const proprietaire = ligne.ownerId === userId;
  if (proprietaire && ligne.creation) return { lecture: true, ecriture: true, role: 'user' };
  const dr = await droits.de(ligne.id, userId, o);
  if (proprietaire && !dr.engage && !dr.indisponible)
    return { lecture: true, ecriture: true, role: 'user', droits: dr };
  let lecture = proprietaire || dr.lecture;
  if (lecture && !proprietaire && !dr.ecriture && ligne.kind === 'npc') {
    const lisible = await Promise.all(
      (dr.campagnes ?? []).map(async (c) => {
        const camp = await droits.camp(c, ligne.id, userId);
        if (camp === 'players' || camp === 'allies') return true;
        // Q4 levée par Théo (2026-09-30) : l'attaque se calcule dans le navigateur de
        // l'attaquant, un joueur de la campagne lit donc la fiche du PNJ qu'il vise
        return camp !== null && (await droits.role(c, userId)) === 'player';
      }),
    );
    lecture = lisible.some(Boolean);
  }
  return {
    lecture,
    ecriture: dr.ecriture,
    // Qui l'incarne écrit en joueur, même s'il est aussi MJ ; sinon, c'est le MJ
    role: dr.incarne ? 'user' : 'gm',
    droits: dr,
  };
}

/**
 * Vérifie les droits de `userId` sur des personnages actifs (voir `acces`). Renvoie
 * le rôle de l'appelant pour les événements : `gm` si une écriture ne lui est permise
 * que comme MJ, sinon `user`. Sans droit de lecture : 404 ; lecture seule : 403 ;
 * campaign injoignable quand il décide : 503. Suppression : le propriétaire seul
 * (403), et pas tant qu'un autre membre incarne le personnage (409 `character_played`).
 */
export async function autoriser(
  db: Db | Tx,
  droits: DroitsCampagnes,
  userId: string,
  demandes: { id: string; mode: Mode }[],
): Promise<ActorRole> {
  const ids = [...new Set(demandes.map((d) => d.id))];
  const lignes = await db
    .select({
      id: characters.id,
      ownerId: characters.ownerId,
      creation: enCreation,
      kind: characters.kind,
    })
    .from(characters)
    .where(and(inArray(characters.id, ids), isNull(characters.deletedAt)));
  let role: ActorRole = 'user';
  for (const d of demandes) {
    const ligne = lignes.find((l) => l.id === d.id);
    if (!ligne) throw HttpError.notFound('Personnage introuvable');
    const a = await acces(droits, userId, ligne);
    if (!a.lecture) {
      if (a.droits?.indisponible) throw campaignIndisponible();
      throw HttpError.notFound('Personnage introuvable');
    }
    if (d.mode === 'proprietaire') {
      if (ligne.ownerId !== userId)
        throw HttpError.forbidden('Seul le propriétaire peut supprimer ce personnage');
      const dr = a.droits ?? (await droits.de(ligne.id, userId));
      if (dr.indisponible) throw campaignIndisponible();
      if (dr.autreIncarnateur)
        throw HttpError.conflict(
          'Un autre membre incarne ce personnage : retirez-le d’abord de sa campagne',
          'character_played',
        );
    } else if (d.mode === 'ecriture') {
      if (!a.ecriture) {
        if (a.droits?.indisponible) throw campaignIndisponible();
        throw HttpError.forbidden(
          ligne.ownerId === userId
            ? 'Vous ne l’incarnez pas : sa fiche se modifie par le joueur qui l’incarne et le MJ'
            : 'Réservé au joueur qui incarne ce personnage et au MJ',
        );
      }
      if (a.role === 'gm') role = 'gm';
    }
  }
  return role;
}

/** Accès de `userId` à un personnage déjà lu (droits renvoyés avec la fiche). */
export function accesA(
  droits: DroitsCampagnes,
  userId: string,
  ligne: Ligne,
  o: { frais?: boolean } = {},
): Promise<Acces> {
  return acces(droits, userId, { ...ligne, creation: ligne.etat.creation === true }, o);
}

/**
 * Système d'un personnage enregistré (introuvable : données incohérentes, erreur 500),
 * réglé avec les règles optionnelles de sa campagne (`options`, voir `droits.options`) :
 * tout calcul qui en part (fiche, achats, création, actions) les respecte.
 */
export function systemeDe(
  catalogue: Catalogue,
  ligne: Pick<Ligne, 'systemId'>,
  options?: ReglagesOptions,
): SystemeCharge {
  const s = catalogue.charge(ligne.systemId);
  if (!s) throw new Error(`Système ${ligne.systemId} absent du catalogue`);
  return avecOptions(s, options);
}

/** Résumé d'un personnage enregistré (fiche recalculée seulement hors cache). */
export function resumeDe(
  catalogue: Catalogue,
  ligne: Pick<Ligne, 'id' | 'version' | 'systemId' | 'etat'>,
  options?: ReglagesOptions,
): CharacterSummary {
  return summaryOf(
    catalogue,
    ligne,
    () => verifierEtat(systemeDe(catalogue, ligne, options), ligne.etat).fiche,
    options,
  );
}

/**
 * Forme renvoyée par l'API : état enregistré, fiche recalculée, présentation et résumé.
 * `publique` : vue d'un joueur qui ne peut pas écrire sur le personnage, sans les
 * exemplaires cachés (la fiche est recalculée sans eux). `options` : règles optionnelles
 * de sa campagne (défauts du système sans elles).
 */
export function versApi(
  catalogue: Catalogue,
  ligne: Ligne,
  o: { publique?: boolean; options?: ReglagesOptions } = {},
): Personnage {
  const systeme = systemeDe(catalogue, ligne, o.options);
  const complet = verifierEtat(systeme, ligne.etat);
  const { etat, fiche } = o.publique ? verifierEtat(systeme, vuePublique(complet.etat)) : complet;
  return {
    id: ligne.id,
    ownerId: ligne.ownerId,
    nom: ligne.nom,
    avatarUrl: ligne.avatarUrl,
    tokenUrl: ligne.tokenUrl ?? null,
    portraitStudio: ligne.portraitStudio ?? null,
    etat,
    fiche: ficheJson(fiche),
    details: detailsApi(ligne.details),
    summary: summaryOf(catalogue, ligne, () => complet.fiche, o.options),
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
      creation: enCreation,
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
  tokenUrl?: string | null;
  portraitStudio?: PortraitStudio | null;
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
  tokenUrl: ligne.tokenUrl ?? null,
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

/** Joueurs à qui annoncer une écriture du MJ : qui incarne le personnage, son propriétaire en création. */
function voient(appelant: Appelant, ligne: Ligne): string[] {
  const ids = [appelant.joueur, ligne.etat.creation === true ? ligne.ownerId : null];
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
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
  /** Règles optionnelles de la campagne du personnage (validation de l'état). */
  options?: ReglagesOptions,
): Promise<Ligne> {
  const etat = changement.etat
    ? verifierEtat(systemeDe(catalogue, ligne, options), changement.etat).etat
    : undefined;
  if (etat) verifierInventaire(etat);
  const [suivante] = await tx
    .update(characters)
    .set({
      ...(etat ? { etat, systemVersion: etat.systeme.version, type: etat.type } : {}),
      ...(changement.nom !== undefined ? { nom: changement.nom } : {}),
      ...(changement.avatarUrl !== undefined ? { avatarUrl: changement.avatarUrl } : {}),
      ...(changement.tokenUrl !== undefined ? { tokenUrl: changement.tokenUrl } : {}),
      ...(changement.portraitStudio !== undefined
        ? { portraitStudio: changement.portraitStudio }
        : {}),
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
    // campagne et au joueur qui incarne le personnage (au propriétaire pendant la
    // création), qui voient la fiche changer en direct ; jamais aux autres joueurs
    // (le diff peut porter des valeurs réservées au MJ)
    ...(appelant.roomId ? { visibility: 'gm_only' as const } : {}),
    actor: acteur(appelant, ligne.id),
    aggregate: { type: 'character', id: ligne.id },
    payload: {
      version: suivante.version,
      operation: evenement.operation,
      ...(appelant.roomId ? { visibleToUsers: voient(appelant, ligne) } : {}),
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
 * l'enregistre, le tout dans une transaction. `options` : règles optionnelles de sa
 * campagne, portées par le système passé au calcul.
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
  options?: ReglagesOptions,
): Promise<Ligne> {
  return db.transaction(async (tx) => {
    const [ligne] = await verrouiller(tx, [id]);
    verifierVersion(ligne!, version);
    const { changement, operation, details } = calcul(
      ligne!,
      systemeDe(catalogue, ligne!, options),
    );
    return enregistrer(
      tx,
      ctx,
      catalogue,
      appelant,
      ligne!,
      changement,
      { operation, ...(details ? { details } : {}) },
      options,
    );
  });
}

/**
 * Écriture sur deux personnages dans une transaction (don d'un objet) : les deux lignes
 * sont verrouillées (ordre des identifiants), la version du premier est vérifiée, chacune
 * est enregistrée avec son événement `character.updated`. Le second est annoncé dans
 * `salle.roomId` (campagne commune), à qui l'incarne (`salle.joueur`) et aux MJ.
 * `options` : règles optionnelles de la campagne de chacun.
 */
export async function modifierPaire(
  db: Db,
  ctx: EventContext,
  catalogue: Catalogue,
  appelant: Appelant,
  salle: { roomId: string; joueur: string | null },
  ids: [string, string],
  version: number,
  calcul: (
    a: Ligne,
    b: Ligne,
    systeme: SystemeCharge,
  ) => {
    a: { etat: EtatEntite; operation: string; details?: Record<string, unknown> };
    b: { etat: EtatEntite; operation: string; details?: Record<string, unknown> };
  },
  options: [ReglagesOptions, ReglagesOptions] = [{}, {}],
): Promise<Ligne> {
  return db.transaction(async (tx) => {
    const [a, b] = await verrouiller(tx, ids);
    verifierVersion(a!, version);
    if (a!.systemId !== b!.systemId)
      throw HttpError.badRequest(
        'Les deux personnages ont des systèmes différents',
        'systeme_different',
      );
    const r = calcul(a!, b!, systemeDe(catalogue, a!, options[0]));
    const suivante = await enregistrer(
      tx,
      ctx,
      catalogue,
      appelant,
      a!,
      { etat: r.a.etat },
      {
        operation: r.a.operation,
        ...(r.a.details ? { details: r.a.details } : {}),
      },
      options[0],
    );
    await enregistrer(
      tx,
      ctx,
      catalogue,
      { ...appelant, roomId: salle.roomId, joueur: salle.joueur },
      b!,
      { etat: r.b.etat },
      {
        operation: r.b.operation,
        ...(r.b.details ? { details: r.b.details } : {}),
      },
      options[1],
    );
    return suivante;
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

/**
 * Supprimé depuis moins de `TRASH_DAYS` jours : restaurable (au-delà, en attente de purge). Les
 * instances de PNJ n'y passent pas : leur modèle demeure, elles sont purgées à la passe suivante.
 */
const dansLaCorbeille = and(
  ne(characters.kind, 'npc'),
  sql`${characters.deletedAt} IS NOT NULL`,
  sql`${characters.deletedAt} > now() - make_interval(days => ${TRASH_DAYS})`,
);

/** Corbeille d'un utilisateur : ses personnages supprimés, restaurables, les plus récents d'abord. */
export function corbeille(db: Db, ownerId: string) {
  return db
    .select({
      id: characters.id,
      nom: characters.nom,
      avatarUrl: characters.avatarUrl,
      deletedAt: characters.deletedAt,
    })
    .from(characters)
    .where(and(eq(characters.ownerId, ownerId), dansLaCorbeille))
    .orderBy(desc(characters.deletedAt));
}

/**
 * Restaure un personnage de la corbeille (son propriétaire seul) : la fiche revient, à réengager
 * dans une campagne (son retrait l'en avait sorti, tokens et place en combat compris).
 */
export async function restaurer(db: Db, ctx: EventContext, appelant: Appelant, id: string) {
  const owner = appelant.userId;
  if (!owner) throw HttpError.notFound('Personnage introuvable dans la corbeille');
  await db.transaction(async (tx) => {
    const [ligne] = await tx
      .select({ version: characters.version })
      .from(characters)
      .where(and(eq(characters.id, id), eq(characters.ownerId, owner), dansLaCorbeille))
      .for('update');
    if (!ligne) throw HttpError.notFound('Personnage introuvable dans la corbeille');
    await tx
      .update(characters)
      .set({ deletedAt: null, version: ligne.version + 1, updatedAt: sql`now()` })
      .where(eq(characters.id, id));
    await appendEvent(tx, ctx, {
      type: 'character.restored',
      ...salle(appelant),
      actor: acteur(appelant, id),
      aggregate: { type: 'character', id },
      payload: { version: ligne.version + 1 },
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
