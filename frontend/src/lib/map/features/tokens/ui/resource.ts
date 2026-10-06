/**
 * Ressource principale d'un personnage, pour la jauge de son token : la première ressource du
 * premier bloc « ressources » de sa fiche (présentation du système), sinon la première
 * ressource du type d'entité ; visible de ce viewer (attributs réservés au MJ). Même lecture que
 * le bandeau de la fiche (`components/fiche/banner.tsx`) : aucune clé de jeu en dur.
 */
import type { Fiche, Presentation, SystemeCharge } from '@vtt/rules';
import {
  estRessource,
  visiblePour,
  widgetsDe,
  type ContexteFiche,
} from '@/components/fiche/widgets';
import type { ResourceGauge } from '../engine/model';

export function mainResource(o: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  personnage: ContexteFiche['personnage'];
  mj: boolean;
}): ResourceGauge | null {
  const ctx: ContexteFiche = {
    systeme: o.systeme,
    presentation: o.presentation,
    fiche: o.fiche,
    personnage: o.personnage,
    mj: o.mj,
  };
  const bloc = widgetsDe(ctx).find((w) => w.type === 'ressources');
  const keys = (
    bloc?.type === 'ressources'
      ? bloc.attributs
      : [...o.fiche.entite.attributs.values()]
          .filter((a) => a.nature === 'ressource')
          .map((a) => a.cle)
  ).filter((c) => visiblePour(ctx, c) && estRessource(ctx, c));
  for (const key of keys) {
    const a = o.fiche.entite.attributs.get(key);
    const v = o.fiche.valeurs.get(key);
    if (!a || !v || typeof v.valeur !== 'number') continue;
    const max = typeof v.max === 'number' ? v.max : v.valeur;
    const look = o.presentation?.ressources[key];
    return {
      key,
      label: a.abrege ?? a.nom,
      value: v.valeur,
      max,
      color: look?.couleur ?? null,
      rising: look?.sens === 'montant',
    };
  }
  return null;
}
