/**
 * Import des titres Firebase :
 * - catalogue : collection `titles` ({ id, label, order, defaultUnlocked, condition }) ;
 * - titres débloqués : champ `titles` des profils users/{uid}, map
 *   slug -> "unlocked" | "locked" (clés parfois au format d'avant migration :
 *   libellé complet, ou slug avec « _ »).
 * Rejouable : rien n'est écrasé (ON CONFLICT DO NOTHING).
 */
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { titles, userTitles } from '../../db/schema.js';
import {
  ALIAS_SLUGS,
  descriptionDe,
  slugDe,
  type ConditionTitre,
  type TitreCatalogue,
} from './catalogue.js';

export interface DocFirestore {
  path: string;
  id: string;
  data: Record<string, unknown>;
}

/** Slug identity d'une clé Firebase (ancien slug, libellé ou alias retiré). */
export function slugImporte(cle: string): string {
  const slug = slugDe(cle);
  return ALIAS_SLUGS[slug] ?? slug;
}

function conditionImportee(brut: unknown): ConditionTitre | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const c = brut as Record<string, unknown>;
  if (c.type === 'time' && typeof c.minutes === 'number' && Number.isFinite(c.minutes)) {
    return { type: 'time', minutes: c.minutes };
  }
  if (c.type === 'event' && typeof c.description === 'string') {
    return { type: 'event', description: c.description.slice(0, 500) };
  }
  if (c.type === 'premium') return { type: 'premium' };
  return null;
}

/** Document Firestore titles/{slug} -> ligne du catalogue, ou null s'il est inexploitable. */
export function titreDepuisFirestore(doc: DocFirestore): TitreCatalogue | null {
  const d = doc.data;
  const label = typeof d.label === 'string' ? d.label.trim().slice(0, 100) : '';
  if (!label) return null;
  const slug = slugDe(doc.id) || slugDe(label);
  if (!slug || ALIAS_SLUGS[slug]) return null;
  const condition = conditionImportee(d.condition);
  return {
    slug,
    label,
    description: descriptionDe(condition),
    condition,
    defaultUnlocked: d.defaultUnlocked === true,
    sortOrder: typeof d.order === 'number' && Number.isInteger(d.order) ? d.order : 0,
  };
}

/** Slugs débloqués d'un profil Firebase (valeur "unlocked" uniquement). */
export function slugsDebloques(profil: Record<string, unknown>): string[] {
  const carte = profil.titles;
  if (typeof carte !== 'object' || carte === null || Array.isArray(carte)) return [];
  const slugs = new Set<string>();
  for (const [cle, statut] of Object.entries(carte)) {
    if (statut !== 'unlocked') continue;
    const slug = slugImporte(cle);
    if (slug) slugs.add(slug);
  }
  return [...slugs].sort();
}

/**
 * Importe le catalogue des titres (collection Firestore `titles`) et les titres
 * débloqués (champ `titles` des documents users/{uid}). Rejouable.
 * (Contrat figé : implémenté par le module titres, appelé par import/cli.ts.)
 */
export async function importerTitres(
  db: Db,
  ctx: EventContext,
  entrees: {
    catalogue: DocFirestore[];
    profils: ReadonlyMap<string, Record<string, unknown>>;
    uuidParUid: ReadonlyMap<string, string>;
  },
): Promise<Record<string, number>> {
  const rapport = {
    catalogueImportes: 0,
    catalogueDejaPresents: 0,
    catalogueIgnores: 0,
    profils: 0,
    comptesAbsents: 0,
    titresImportes: 0,
    titresDejaPresents: 0,
    titresInconnus: 0,
    erreurs: 0,
  };

  // 1. Catalogue : les titres déjà connus (amorcés depuis le code) restent tels quels
  const lignes = new Map<string, TitreCatalogue>();
  for (const doc of entrees.catalogue) {
    const t = titreDepuisFirestore(doc);
    if (!t || lignes.has(t.slug)) rapport.catalogueIgnores++;
    else lignes.set(t.slug, t);
  }
  if (lignes.size) {
    const inseres = await db
      .insert(titles)
      .values([...lignes.values()])
      .onConflictDoNothing({ target: titles.slug })
      .returning({ slug: titles.slug });
    rapport.catalogueImportes = inseres.length;
    rapport.catalogueDejaPresents = lignes.size - inseres.length;
  }

  const connus = new Set((await db.select({ slug: titles.slug }).from(titles)).map((t) => t.slug));

  // 2. Titres débloqués : une transaction par joueur (lignes + événement)
  for (const [uid, profil] of entrees.profils) {
    const slugs = slugsDebloques(profil);
    if (!slugs.length) continue;
    rapport.profils++;
    const userId = entrees.uuidParUid.get(uid);
    if (!userId) {
      rapport.comptesAbsents++;
      continue;
    }
    const valides = slugs.filter((s) => connus.has(s));
    rapport.titresInconnus += slugs.length - valides.length;
    if (!valides.length) continue;

    try {
      const nbInseres = await db.transaction(async (tx) => {
        const inseres = await tx
          .insert(userTitles)
          .values(valides.map((slug) => ({ userId, slug })))
          .onConflictDoNothing()
          .returning({ slug: userTitles.slug });
        if (inseres.length) {
          await appendEvent(tx, ctx, {
            type: 'identity.titles_imported',
            actor: { userId: null, role: 'system', characterId: null },
            aggregate: { type: 'user', id: userId },
            visibility: 'owner',
            payload: { source: 'firebase', slugs: inseres.map((i) => i.slug).sort() },
          });
        }
        return inseres.length;
      });
      rapport.titresImportes += nbInseres;
      rapport.titresDejaPresents += valides.length - nbInseres;
    } catch {
      // Compte supprimé depuis la correspondance des uid : on passe au suivant
      rapport.erreurs++;
    }
  }

  return rapport;
}
