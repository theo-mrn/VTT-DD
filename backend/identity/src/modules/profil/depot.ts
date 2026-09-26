/**
 * Accès aux profils : lecture complète (propriétaire), lecture publique,
 * recherche, modification et temps de jeu. Chaque modification écrit son
 * événement dans l'outbox, dans la même transaction ; les événements ne
 * contiennent jamais de valeur saisie, seulement les noms des champs.
 */
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { credentials, oauthAccounts, profiles, users } from '../../db/schema.js';
import { echapperLike, jsonEgal, urlImageAcceptee, type PatchProfil } from './validation.js';

export type Fournisseur = 'google' | 'discord';

export interface MonProfil {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  bannerUrl: string | null;
  borderType: string;
  showPremiumBadge: boolean;
  timeSpentMinutes: number;
  emailNotifications: boolean;
  settings: Record<string, unknown>;
  hasPassword: boolean;
  providers: Fournisseur[];
  createdAt: string;
}

export interface ProfilPublic {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  bannerUrl: string | null;
  borderType: string;
  premium: false;
  showPremiumBadge: boolean;
  timeSpentMinutes: number;
}

export interface ResultatRecherche {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
}

/** Profil complet du propriétaire, avec ses moyens de connexion. */
export async function lireMonProfil(db: Db, userId: string): Promise<MonProfil | null> {
  const [ligne] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
      title: profiles.title,
      bio: profiles.bio,
      bannerUrl: profiles.bannerUrl,
      borderType: profiles.borderType,
      showPremiumBadge: profiles.showPremiumBadge,
      timeSpentMinutes: profiles.timeSpentMinutes,
      emailNotifications: profiles.emailNotifications,
      settings: profiles.settings,
      hasPassword: sql<boolean>`exists (select 1 from ${credentials} where ${credentials.userId} = ${users.id})`,
      providers: sql<
        Fournisseur[]
      >`coalesce((select array_agg(distinct ${oauthAccounts.provider} order by ${oauthAccounts.provider}) from ${oauthAccounts} where ${oauthAccounts.userId} = ${users.id}), '{}')`,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!ligne) return null;
  return { ...ligne, createdAt: ligne.createdAt.toISOString() };
}

/** Profil visible par les autres joueurs : jamais d'e-mail. Null si inconnu ou désactivé. */
export async function lireProfilPublic(db: Db, userId: string): Promise<ProfilPublic | null> {
  const [ligne] = await db
    .select({
      id: users.id,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
      title: profiles.title,
      bio: profiles.bio,
      bannerUrl: profiles.bannerUrl,
      borderType: profiles.borderType,
      showPremiumBadge: profiles.showPremiumBadge,
      timeSpentMinutes: profiles.timeSpentMinutes,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.disabledAt)))
    .limit(1);
  // L'abonnement relève du service billing : jamais premium côté identity pour l'instant
  return ligne ? { ...ligne, premium: false } : null;
}

/** Recherche par nom (sous-chaîne, insensible à la casse), hors soi et comptes désactivés. */
export async function rechercherProfils(
  db: Db,
  userId: string,
  texte: string,
  limite: number,
): Promise<ResultatRecherche[]> {
  const motif = `%${echapperLike(texte)}%`;
  return db
    .select({
      id: users.id,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
      title: profiles.title,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(
      and(
        sql`${profiles.name} ilike ${motif} escape '\\'`,
        ne(users.id, userId),
        isNull(users.disabledAt),
      ),
    )
    .orderBy(sql`lower(${profiles.name})`, asc(users.id))
    .limit(limite);
}

/** URL d'image refusée : ni null, ni la valeur actuelle, ni notre stockage. */
export class UrlImageRefusee extends Error {
  constructor(public readonly champ: 'avatarUrl' | 'bannerUrl') {
    super(`${champ} refusée`);
    this.name = 'UrlImageRefusee';
  }
}

/**
 * Applique les champs fournis et renvoie la liste de ceux qui ont réellement
 * changé ([] si rien ne change : ni écriture, ni événement), ou null si le
 * profil n'existe pas.
 */
export async function modifierProfil(
  db: Db,
  ctx: EventContext,
  userId: string,
  patch: PatchProfil,
  baseStockage: string | null,
): Promise<string[] | null> {
  return db.transaction(async (tx) => {
    // Verrou de ligne : deux modifications simultanées ne se mélangent pas
    const [actuel] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .for('update')
      .limit(1);
    if (!actuel) return null;

    if (
      patch.avatarUrl !== undefined &&
      !urlImageAcceptee(patch.avatarUrl, actuel.avatarUrl, baseStockage, 'avatars', userId)
    ) {
      throw new UrlImageRefusee('avatarUrl');
    }
    if (
      patch.bannerUrl !== undefined &&
      !urlImageAcceptee(patch.bannerUrl, actuel.bannerUrl, baseStockage, 'banners', userId)
    ) {
      throw new UrlImageRefusee('bannerUrl');
    }

    const changements: Partial<typeof profiles.$inferInsert> = {};
    for (const [champ, valeur] of Object.entries(patch) as [keyof PatchProfil, unknown][]) {
      if (valeur === undefined) continue;
      const avant = actuel[champ];
      const identique = champ === 'settings' ? jsonEgal(avant, valeur) : avant === valeur;
      if (!identique) (changements as Record<string, unknown>)[champ] = valeur;
    }
    const champs = Object.keys(changements).sort();
    if (champs.length === 0) return [];

    await tx
      .update(profiles)
      .set({ ...changements, updatedAt: new Date() })
      .where(eq(profiles.userId, userId));
    await appendEvent(tx, ctx, {
      type: 'identity.profile_updated',
      actor: { userId, role: 'user', characterId: null },
      aggregate: { type: 'user', id: userId },
      payload: { fields: champs },
      visibility: 'owner',
    });
    return champs;
  });
}

/**
 * Ajoute du temps de jeu par un incrément SQL atomique (deux appels
 * simultanés s'additionnent) et renvoie le nouveau total, ou null si le
 * profil n'existe pas.
 */
export async function ajouterTempsDeJeu(
  db: Db,
  ctx: EventContext,
  userId: string,
  minutes: number,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [ligne] = await tx
      .update(profiles)
      .set({ timeSpentMinutes: sql`${profiles.timeSpentMinutes} + ${minutes}` })
      .where(eq(profiles.userId, userId))
      .returning({ total: profiles.timeSpentMinutes });
    if (!ligne) return null;
    await appendEvent(tx, ctx, {
      type: 'identity.play_time_added',
      actor: { userId, role: 'user', characterId: null },
      aggregate: { type: 'user', id: userId },
      payload: { minutes, totalMinutes: ligne.total },
      visibility: 'owner',
    });
    return ligne.total;
  });
}
