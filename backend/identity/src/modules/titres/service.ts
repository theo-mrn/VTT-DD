/**
 * Déblocage et sélection des titres. Chaque déblocage écrit son événement
 * identity.title_unlocked dans la même transaction que la ligne user_titles.
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, isNotNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { profiles, titles, userTitles } from '../../db/schema.js';

/** Contexte des traitements lancés hors requête HTTP. */
const contexteInterne = (): EventContext => ({ correlationId: `titres-${uuidv7()}` });

const acteur = (userId: string) => ({ userId, role: 'user' as const, characterId: null });

/** Titre débloqué : slug et libellé (repris dans l'événement identity.title_unlocked). */
export interface UnlockedTitle {
  slug: string;
  label: string;
}

async function evenementDeblocage(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  titre: UnlockedTitle,
  source: 'time' | 'event',
) {
  await appendEvent(tx, ctx, {
    type: 'identity.title_unlocked',
    actor: acteur(userId),
    aggregate: { type: 'user', id: userId },
    visibility: 'owner',
    payload: { slug: titre.slug, label: titre.label, source },
  });
}

/**
 * Débloque un titre dans la transaction `tx` (celle de l'appelant) et y écrit
 * son événement. Renvoie le titre s'il vient d'être débloqué ; null s'il
 * l'était déjà ou s'il n'existe pas au catalogue.
 */
export async function unlockTitleInTx(
  tx: Tx,
  ctx: EventContext,
  userId: string,
  slug: string,
  source: 'time' | 'event' = 'event',
): Promise<UnlockedTitle | null> {
  const res = await tx.execute<{ slug: string; label: string }>(sql`
    with ins as (
      insert into ${userTitles} (user_id, slug)
      select ${userId}::uuid, t.slug from ${titles} t where t.slug = ${slug}
      on conflict (user_id, slug) do nothing
      returning slug)
    select ins.slug, t.label from ins join ${titles} t on t.slug = ins.slug`);
  const titre = res.rows[0];
  if (!titre) return null;
  await evenementDeblocage(tx, ctx, userId, titre, source);
  return titre;
}

/**
 * Débloque les titres dont la condition de temps de jeu est atteinte.
 * Appelé par le module profil après chaque ajout de temps de jeu.
 * Renvoie les slugs nouvellement débloqués. (Contrat figé : implémenté par le module titres.)
 */
export async function debloquerTitresParTemps(
  db: Db,
  userId: string,
  totalMinutes: number,
): Promise<string[]> {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return [];
  const ctx = contexteInterne();
  return db.transaction(async (tx) => {
    // Insertion idempotente : un titre déjà débloqué (ou débloqué en même temps
    // par une autre requête) n'est pas renvoyé, et n'a donc pas d'événement.
    const res = await tx.execute<{ slug: string; label: string }>(sql`
      with ins as (
        insert into ${userTitles} (user_id, slug)
        select ${userId}::uuid, t.slug
          from ${titles} t
         where t.condition->>'type' = 'time'
           and jsonb_typeof(t.condition->'minutes') = 'number'
           and (t.condition->>'minutes')::numeric <= ${totalMinutes}
         order by t.slug
        on conflict (user_id, slug) do nothing
        returning slug)
      select ins.slug, t.label from ins join ${titles} t on t.slug = ins.slug`);
    const debloques = res.rows.sort((a, b) => a.slug.localeCompare(b.slug));
    for (const titre of debloques) await evenementDeblocage(tx, ctx, userId, titre, 'time');
    return debloques.map((t) => t.slug);
  });
}

/**
 * Débloque un titre précis (jets de dés, défis…). Renvoie true s'il vient
 * d'être débloqué, false s'il l'était déjà ou s'il n'existe pas au catalogue.
 */
export async function debloquerTitre(
  db: Db,
  userId: string,
  slug: string,
  ctx: EventContext = contexteInterne(),
): Promise<boolean> {
  return db.transaction(async (tx) => (await unlockTitleInTx(tx, ctx, userId, slug)) !== null);
}

export interface TitrePublic {
  slug: string;
  label: string;
  description: string | null;
  condition: Record<string, unknown> | null;
  defaultUnlocked: boolean;
}

/** Catalogue complet, trié par ordre puis libellé. */
export async function listerCatalogue(db: Db): Promise<TitrePublic[]> {
  return db
    .select({
      slug: titles.slug,
      label: titles.label,
      description: titles.description,
      condition: titles.condition,
      defaultUnlocked: titles.defaultUnlocked,
    })
    .from(titles)
    .orderBy(asc(titles.sortOrder), asc(titles.label));
}

/** Titres utilisables par le joueur : débloqués, plus ceux accordés à tous. */
export async function listerTitresDuJoueur(
  db: Db,
  userId: string,
): Promise<{ slug: string; label: string; unlockedAt: string | null }[]> {
  const lignes = await db
    .select({ slug: titles.slug, label: titles.label, unlockedAt: userTitles.unlockedAt })
    .from(titles)
    .leftJoin(userTitles, and(eq(userTitles.slug, titles.slug), eq(userTitles.userId, userId)))
    .where(or(eq(titles.defaultUnlocked, true), isNotNull(userTitles.userId)))
    .orderBy(asc(titles.sortOrder), asc(titles.label));
  return lignes.map((l) => ({
    slug: l.slug,
    label: l.label,
    unlockedAt: l.unlockedAt ? l.unlockedAt.toISOString() : null,
  }));
}

/**
 * Affiche un titre sur le profil (son libellé est copié dans profiles.title).
 * Refusé (403) si le joueur ne l'a pas débloqué ; null retire le titre.
 */
export async function choisirTitre(
  db: Db,
  ctx: EventContext,
  userId: string,
  slug: string | null,
): Promise<{ title: string | null }> {
  return db.transaction(async (tx) => {
    let label: string | null = null;
    if (slug !== null) {
      const [titre] = await tx
        .select({ label: titles.label })
        .from(titles)
        .leftJoin(userTitles, and(eq(userTitles.slug, titles.slug), eq(userTitles.userId, userId)))
        .where(
          and(
            eq(titles.slug, slug),
            or(eq(titles.defaultUnlocked, true), isNotNull(userTitles.userId)),
          ),
        )
        .limit(1);
      if (!titre) throw HttpError.forbidden("Ce titre n'est pas débloqué");
      label = titre.label;
    }

    const maj = await tx
      .update(profiles)
      .set({ title: label, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning({ userId: profiles.userId });
    if (maj.length === 0) throw HttpError.notFound('Profil introuvable');

    await appendEvent(tx, ctx, {
      type: 'identity.title_selected',
      actor: acteur(userId),
      aggregate: { type: 'user', id: userId },
      visibility: 'owner',
      payload: { slug, title: label },
    });
    return { title: label };
  });
}
