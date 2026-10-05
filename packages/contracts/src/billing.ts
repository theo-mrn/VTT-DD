import { z } from 'zod';

/**
 * Droits d'un utilisateur, publiés par billing (source de vérité) et
 * appliqués par dice (skins, accès à tous les skins) et identity (badge
 * premium). Voir docs/paiement.md, « Droits par événements ».
 *
 * L'événement porte l'état complet, pas une variation : un consommateur
 * applique la dernière `version` reçue et ignore une version plus ancienne ou
 * égale. L'ordre de livraison et les doublons sont donc sans effet.
 */
export const ENTITLEMENTS_CHANGED = 'billing.entitlements_changed';

export const EntitlementsChanged = z.object({
  userId: z.uuid(),
  /** Croît à chaque changement des droits de cet utilisateur. */
  version: z.number().int().positive(),
  premium: z.boolean(),
  /** Skins de dés achetés (ou offerts) ; avec premium, tous les skins sont accessibles. */
  diceSkins: z.array(z.string().min(1)),
  tokenFrames: z.array(z.string().min(1)),
});
export type EntitlementsChanged = z.infer<typeof EntitlementsChanged>;
