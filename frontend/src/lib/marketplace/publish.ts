/**
 * Publier en un geste (docs/marketplace.md § « Publier ») : à partir d'une scène, le navigateur
 * enchaîne ce que l'ancien Studio faisait en plusieurs écrans : profil de créateur (repris du
 * compte), fiche, couverture (l'image de la scène), version, contenu, envoi en revue. Un échec en
 * route supprime la fiche à moitié faite.
 */
import type { MapSnapshot, PackContentInput } from '@vtt/contracts';
import { api, ApiError } from '@/lib/api';
import type { Profil } from '@/lib/profil';
import { prepareUpload } from '@/lib/uploads/prepare';
import { uploadFile } from '@/lib/uploads/uploader';
import { marketplaceApi } from './api';
import { buildPack, withoutUrls } from './pack-builder';

export type PublishStep = 'listing' | 'cover' | 'content' | 'review';

/** Nom public d'un créateur : celui du compte, dans les bornes du serveur (2 à 40). */
export function creatorName(name: string): string {
  const n = name.trim().slice(0, 40);
  return n.length >= 2 ? n : n.padEnd(2, '·');
}

/** Profil de créateur repris du compte, créé s'il manque. */
async function ensureCreator(profil: Profil) {
  const me = await marketplaceApi.me();
  if (me.creator) return;
  await marketplaceApi.saveCreator({
    displayName: creatorName(profil.name),
    bio: (profil.bio ?? '').trim().slice(0, 1000),
  });
}

/** Image d'une adresse, si c'en est une (une vidéo de fond ne fait pas une couverture). */
async function imageFrom(url: string | null | undefined, name: string): Promise<File | null> {
  if (!url) return null;
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) return null;
  return new File([blob], `${name}.${blob.type.split('/')[1] ?? 'png'}`, { type: blob.type });
}

/** Envoie le contenu ; adresses refusées (fichier disparu, autre site) retirées une fois. */
async function sendContent(versionId: string, pack: PackContentInput) {
  try {
    await marketplaceApi.setContent(versionId, pack);
  } catch (err) {
    const p =
      err instanceof ApiError ? (err.problem as ApiError['problem'] & { urls?: string[] }) : null;
    if (!p?.code?.startsWith('asset_') || !p.urls?.length) throw err;
    await marketplaceApi.setContent(versionId, withoutUrls(pack, p.urls));
  }
}

/** Fiche, couverture, version, contenu, revue : commun à tout ce qui se publie. */
async function publishPack(o: {
  profil: Profil;
  title: string;
  summary: string;
  /** Couverture choisie ; sinon `coverFrom`. */
  cover?: File | null;
  coverFrom: string | null;
  systemId: string | null;
  pack: PackContentInput;
  onStep: (step: PublishStep) => void;
}): Promise<{ listingId: string }> {
  const listing = await marketplaceApi.createListing({ title: o.title, priceCents: 0 });
  try {
    o.onStep('cover');
    const image = o.cover ?? (await imageFrom(o.coverFrom, 'couverture'));
    const coverUrl = image
      ? await uploadFile(
          { kind: 'listing', id: listing.id },
          'marketplace-cover',
          await prepareUpload(image, 'marketplace-cover'),
        )
      : null;
    await marketplaceApi.updateListing(listing.id, {
      summary: o.summary,
      systemId: o.systemId,
      ...(coverUrl ? { coverUrl } : {}),
      version: listing.version,
    });

    o.onStep('content');
    const version = await marketplaceApi.createVersion(listing.id, { number: '1.0.0', notes: '' });
    await sendContent(version.id, o.pack);

    o.onStep('review');
    await marketplaceApi.submitVersion(version.id);
    return { listingId: listing.id };
  } catch (error) {
    await marketplaceApi.deleteListing(listing.id).catch(() => {});
    throw error;
  }
}

interface PublishCommon {
  profil: Profil;
  title: string;
  summary: string;
  cover?: File | null;
  onStep?: (step: PublishStep) => void;
}

export async function publishScene(
  o: PublishCommon & { campaignId: string; sceneId: string },
): Promise<{ listingId: string }> {
  const step = o.onStep ?? (() => {});
  step('listing');
  await ensureCreator(o.profil);
  const snapshot = await api<MapSnapshot>(
    `/v1/campaigns/${encodeURIComponent(o.campaignId)}/maps/${encodeURIComponent(o.sceneId)}`,
  );
  return publishPack({
    ...o,
    onStep: step,
    coverFrom: snapshot.map.backgroundUrl,
    systemId: null,
    pack: buildPack({ systemId: null, scenes: [snapshot], npcTemplates: [], objectTemplates: [] }),
  });
}

/** Personnage publié comme modèle de PNJ : fiche complète, portrait, jeton. */
export async function publishCharacter(
  o: PublishCommon & { characterId: string; systemId: string },
): Promise<{ listingId: string }> {
  const step = o.onStep ?? (() => {});
  step('listing');
  await ensureCreator(o.profil);
  const c = await api<{
    id: string;
    nom: string;
    avatarUrl: string | null;
    tokenUrl?: string | null;
    etat: Record<string, unknown> | null;
  }>(`/v1/characters/${encodeURIComponent(o.characterId)}`);
  return publishPack({
    ...o,
    onStep: step,
    coverFrom: c.avatarUrl,
    systemId: o.systemId,
    pack: buildPack({
      systemId: o.systemId,
      scenes: [],
      npcTemplates: [
        {
          id: c.id,
          name: o.title,
          imageUrl: c.avatarUrl,
          tokenUrl: c.tokenUrl ?? null,
          actions: [],
          etat: c.etat,
        },
      ],
      objectTemplates: [],
    }),
  });
}
