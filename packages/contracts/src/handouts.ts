/**
 * Projection et documents (docs/projection.md) : bibliothèque du MJ, partages (projeter en
 * plein écran ou envoyer), documents reçus par chacun.
 */
import { z } from 'zod';

export const HANDOUT_MODES = ['show', 'send'] as const;
export const HandoutMode = z.enum(HANDOUT_MODES);
export type HandoutMode = z.infer<typeof HandoutMode>;

/** Délai avant le départ d'une vidéo projetée : le temps de la charger chez tous. */
export const HANDOUT_VIDEO_LEAD_MS = 1_500;
/** Au-delà, une projection non arrêtée n'est plus montrée à qui arrive. */
export const HANDOUT_PROJECTION_TTL_MS = 6 * 3_600_000;

export const Handout = z.object({
  id: z.uuid(),
  campaignId: z.uuid(),
  name: z.string(),
  url: z.string(),
  contentType: z.string(),
  createdAt: z.iso.datetime(),
});
export type Handout = z.infer<typeof Handout>;

export const HandoutShare = z.object({
  id: z.uuid(),
  handoutId: z.uuid(),
  mode: HandoutMode,
  /** Destinataires (utilisateurs) ; null : toute la table. */
  recipients: z.array(z.uuid()).nullable(),
  sharedBy: z.uuid(),
  sharedAt: z.iso.datetime(),
  /** Départ commun d'une vidéo (heure du serveur). */
  startsAt: z.iso.datetime(),
  stoppedAt: z.iso.datetime().nullable(),
});
export type HandoutShare = z.infer<typeof HandoutShare>;

/** Document reçu : un partage et son document. */
export const SharedDocument = HandoutShare.extend({ handout: Handout });
export type SharedDocument = z.infer<typeof SharedDocument>;

export const DocumentsResponse = z.object({
  items: z.array(SharedDocument),
  /** Projection en cours pour moi ; null : aucune. */
  projection: SharedDocument.nullable(),
  /** Heure du serveur (départ commun des vidéos). */
  serverTime: z.iso.datetime(),
});
export type DocumentsResponse = z.infer<typeof DocumentsResponse>;

export const CreateHandout = z.strictObject({
  name: z.string().trim().min(1).max(200),
  url: z.string().url().max(2048),
});
export type CreateHandout = z.infer<typeof CreateHandout>;

export const UpdateHandout = z.strictObject({ name: z.string().trim().min(1).max(200) });

export const ShareHandout = z.strictObject({
  mode: HandoutMode,
  /** null ou absent : toute la table. */
  recipients: z.array(z.uuid()).min(1).max(50).nullable().optional(),
});
export type ShareHandout = z.infer<typeof ShareHandout>;
