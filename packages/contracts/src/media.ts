/**
 * Médiathèque de la campagne (docs/mediatheque.md) : images et vidéos déjà envoyées, rangées en
 * dossiers (trois niveaux), réutilisables depuis la zone d'envoi. Le MJ voit tout et décide de ce
 * que voient les joueurs ; un joueur voit aussi ce qu'il a envoyé et ses propres dossiers.
 */
import { z } from 'zod';
import { ExpectedVersion } from './map.js';

/** Profondeur maximale des dossiers (racine exclue). */
export const MEDIA_MAX_DEPTH = 3;

export const MediaFolder = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  visibleToPlayers: z.boolean(),
  /** Créé par moi : je peux le renommer, le déplacer, le supprimer. */
  mine: z.boolean(),
  version: z.number().int(),
});
export type MediaFolder = z.infer<typeof MediaFolder>;

export const MediaFile = z.object({
  key: z.string(),
  url: z.string(),
  contentType: z.string().nullable(),
  size: z.number().int(),
  createdAt: z.string(),
  folderId: z.string().nullable(),
  visibleToPlayers: z.boolean(),
  /** Envoyé par moi : je peux le ranger. */
  mine: z.boolean(),
});
export type MediaFile = z.infer<typeof MediaFile>;

/** Contenu d'un dossier (ou de la racine) pour qui le lit. */
export const MediaListing = z.object({
  /** Je suis MJ : je vois tout et décide de ce que voient les joueurs. */
  gm: z.boolean(),
  /** Chemin depuis la racine jusqu'au dossier ouvert (vide : racine). */
  path: z.array(z.object({ id: z.string(), name: z.string() })),
  folders: z.array(MediaFolder),
  files: z.array(MediaFile),
});
export type MediaListing = z.infer<typeof MediaListing>;

/** Filtre de la liste : images seules, ou images et vidéos (fond de carte). */
export const LibraryKind = z.enum(['image', 'visual']);
export type LibraryKind = z.infer<typeof LibraryKind>;

const FolderName = z.string().trim().min(1, 'Nom requis').max(60);

export const CreateMediaFolder = z.strictObject({
  name: FolderName,
  parentId: z.uuid().nullable().default(null),
});
export type CreateMediaFolder = z.input<typeof CreateMediaFolder>;

/** Renommer, déplacer ; la visibilité, MJ seulement. */
export const UpdateMediaFolder = z.strictObject({
  name: FolderName.optional(),
  parentId: z.uuid().nullable().optional(),
  visibleToPlayers: z.boolean().optional(),
  version: ExpectedVersion,
});
export type UpdateMediaFolder = z.input<typeof UpdateMediaFolder>;

/** Ranger un fichier ; la visibilité, MJ seulement. */
export const UpdateMediaFile = z.strictObject({
  folderId: z.uuid().nullable().optional(),
  visibleToPlayers: z.boolean().optional(),
});
export type UpdateMediaFile = z.input<typeof UpdateMediaFile>;
