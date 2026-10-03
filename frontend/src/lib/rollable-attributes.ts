/**
 * Attributs proposés dans le lanceur de dés, en trois couches (docs/regles.md,
 * « Attributs jetables ») :
 *   1. les règles : seuls les attributs qui déclarent `jet`, avec leur apport ;
 *   2. la présentation du système : ordre et groupes (`des.jets`) ;
 *   3. la campagne : les attributs que le MJ a retirés pour toute la table.
 *
 * Aucune clé de jeu ici : tout vient de `@vtt/rules` (`attributsJetables`,
 * `declarationsJetables`), du système et des réglages de la campagne.
 */
'use client';

import {
  attributsJetables,
  declarationsJetables,
  grouperJetables,
  type DeclarationJetable,
  type Fiche,
  type Presentation,
  type SystemeCharge,
} from '@vtt/rules';
import { useMemo } from 'react';
import { useCampaignSettings } from './campaign-settings';
import { useCampagne } from './campagnes';
import { useSysteme } from './systemes';

export interface RollableAttribute {
  key: string;
  name: string;
  /** Libellé court de la puce (abrégé, sinon nom). */
  label: string;
  description?: string;
  /** Ce que l'attribut apporte au jet. */
  kind: 'modificateur' | 'valeur' | 'formule';
  /** Terme à ajouter à la formule : `mod(@FOR)`, `@INIT` ou `(formule)`. */
  term: string;
  /** Valeur de l'apport sur la fiche (0 sans fiche). */
  value: number;
  /** Réservé au MJ (`visibilite: mj`) : proposé au seul MJ de la campagne. */
  gmOnly: boolean;
  /** Groupe d'affichage : `title` nul pour les attributs sans groupe. */
  group: { id: string | null; title: string | null };
}

export interface RollableGroup {
  id: string | null;
  title: string | null;
  attributes: RollableAttribute[];
}

const toRollable = (d: DeclarationJetable, value = 0): RollableAttribute => ({
  key: d.cle,
  name: d.nom,
  label: d.abrege ?? d.nom,
  ...(d.description !== undefined ? { description: d.description } : {}),
  kind: d.genre,
  term: d.terme,
  value,
  gmOnly: d.mj,
  group: { id: d.groupe.id, title: d.groupe.titre },
});

/** Regroupe une liste ordonnée d'attributs par groupes consécutifs. */
export function groupRollable(list: readonly RollableAttribute[]): RollableGroup[] {
  return grouperJetables(
    list.map((a) => ({ a, groupe: { id: a.group.id, titre: a.group.title } })),
  ).map((g) => ({
    id: g.groupe.id,
    title: g.groupe.titre,
    attributes: g.attributs.map((x) => x.a),
  }));
}

/**
 * Tous les attributs jetables d'un système (tous types d'entité, sans doublon de clé),
 * dans l'ordre du lanceur : ce que le MJ peut retirer dans les réglages de la campagne.
 */
export function systemRollableAttributes(
  systeme: SystemeCharge,
  presentation: Presentation | null,
): RollableAttribute[] {
  const seen = new Set<string>();
  const list: RollableAttribute[] = [];
  for (const entite of systeme.entites.keys()) {
    for (const d of declarationsJetables(systeme, entite, { presentation, mj: true })) {
      if (seen.has(d.cle)) continue;
      seen.add(d.cle);
      list.push(toRollable(d));
    }
  }
  return list;
}

/**
 * Puces du lanceur de dés pour une fiche calculée, dans une campagne (ou hors campagne :
 * `campaignId` nul, aucun retrait). Les attributs réservés au MJ ne sont proposés qu'au MJ.
 *
 * `loading` : réglages de la campagne en cours de lecture (ne pas afficher de puces
 * qui pourraient disparaître). `error` : réglages illisibles ; la liste n'est alors
 * pas filtrée par la campagne.
 */
export function useRollableAttributes(campaignId: string | null, fiche: Fiche | null) {
  const systeme = useSysteme(fiche?.systeme.source.id);
  const settings = useCampaignSettings(campaignId);
  const campagne = useCampagne(campaignId);
  const presentation = systeme.data?.presentation ?? null;
  const hidden = settings.data?.dice.hiddenAttributes;
  const gm = campagne.data?.role === 'gm';

  const attributes = useMemo(
    () =>
      fiche
        ? attributsJetables(fiche, {
            presentation,
            retires: hidden ?? [],
            mj: gm,
          }).map((a) => toRollable(a, a.apport))
        : [],
    [fiche, presentation, hidden, gm],
  );
  const groups = useMemo(() => groupRollable(attributes), [attributes]);

  return {
    attributes,
    groups,
    loading: Boolean(campaignId) && settings.isPending,
    error: settings.error ? settings.error.message : null,
  };
}
