/**
 * Fin de vie d'un compte (docs/legal.md). identity publie `identity.user_deleted` (sujet
 * `vtt.global.identity.user_deleted`) quand la suppression devient définitive, 7 jours après
 * la demande : chaque service efface alors ce qui appartient à ce compte, par un consommateur
 * durable, jamais sur appel direct. L'identifiant est celui de l'agrégat (`aggregate.id`).
 *
 * `campaign.deleted` (sujet `vtt.<campaignId>.campaign.deleted`) emporte de même tout ce qui
 * appartient à la campagne, dans chaque service.
 */
export const USER_DELETED = 'identity.user_deleted';
export const USER_DELETED_SUBJECT = `vtt.global.${USER_DELETED}`;

export const CAMPAIGN_DELETED = 'campaign.deleted';
export const CAMPAIGN_DELETED_SUBJECT = `vtt.*.${CAMPAIGN_DELETED}`;
