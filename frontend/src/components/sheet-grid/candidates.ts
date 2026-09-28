/**
 * Blocs proposés par le sélecteur : ceux de la présentation du système, puis ceux que le
 * système permet (un par groupe d'attributs, par sorte possédable, par attribut texte…).
 * Tout est déduit du système chargé : sortes (`pour`, `activable`, `exemplaires`,
 * `quantites`, `rangs`), groupes, natures et visibilité des attributs, arbres, achats,
 * monnaies et actions. Aucune clé de jeu.
 */
import { monnaiesDe, type Widget } from '@vtt/rules';
import {
  actionsDisponibles,
  visiblePour,
  widgetsDe,
  type ContexteFiche,
} from '@/components/fiche/widgets';
import { defaultSkillSortes } from '@/components/fiche/blocks/skills/abilities';
import { groupesAttributs } from '@/lib/creation';

/** Disposition par défaut : les blocs de la présentation, sans le profil (montré en en-tête). */
export function defaultWidgets(ctx: ContexteFiche): Widget[] {
  return widgetsDe(ctx).filter((w) => w.type !== 'details');
}

/** Tous les blocs que ce personnage peut afficher, sans doublon, présentation d'abord. */
export function candidateWidgets(ctx: ContexteFiche): Widget[] {
  const { fiche, systeme } = ctx;
  const type = fiche.etat.type;
  const sortes = [...systeme.sortes.values()].filter((s) => s.pour.includes(type));
  const nomDe = (s: (typeof sortes)[number]) => s.nomPluriel ?? s.nom;
  const uniques = sortes.filter((s) => s.maximum === 1);
  const ressources = [...fiche.entite.attributs.values()].filter(
    (a) => a.nature === 'ressource' && visiblePour(ctx, a.cle),
  );
  const textes = [...fiche.entite.attributs.values()].filter(
    (a) => a.nature === 'texte' && visiblePour(ctx, a.cle),
  );
  // Objets : sortes qu'on possède en quantité, ou en exemplaires qu'on équipe
  const objets = sortes.filter((s) => s.quantites || (s.activable && s.exemplaires));
  const possedable = (entree: string) => {
    const e = systeme.entrees.get(entree);
    return Boolean(e && systeme.sortes.get(e.sorte)?.pour.includes(type));
  };
  // Progression : des nœuds d'arbre, des rangs achetables ou des entrées accordées par une voie
  const competences =
    [...systeme.arbres.values()].some((a) => a.noeuds.some((n) => possedable(n.entree))) ||
    [...systeme.achats.values()].some(
      (a) => a.obtient.type === 'rang' && systeme.sortes.get(a.obtient.sorte)?.pour.includes(type),
    ) ||
    defaultSkillSortes(systeme, type).length > 0;

  const generes: Widget[] = [
    {
      type: 'details',
      titre: 'Profil',
      sortes: uniques.map((s) => s.id),
      attributs: [],
    },
    ...groupesAttributs(fiche)
      .map((g) => ({
        g,
        cles: g.attributs.filter((a) => a.nature !== 'ressource' && visiblePour(ctx, a.cle)),
      }))
      .filter(({ cles }) => cles.length > 0)
      .map(({ g }) => ({ type: 'attributs' as const, titre: g.nom, groupe: g.id })),
    ...(ressources.length
      ? [
          {
            type: 'ressources' as const,
            titre: 'Ressources',
            attributs: ressources.map((a) => a.cle),
          },
        ]
      : []),
    ...(competences ? [{ type: 'competences' as const, titre: 'Compétences' }] : []),
    ...(objets.length
      ? [{ type: 'inventaire' as const, titre: 'Inventaire', sortes: objets.map((s) => s.id) }]
      : []),
    ...sortes
      .filter((s) => s.maximum !== 1)
      .map((s) => ({ type: 'possessions' as const, titre: nomDe(s), sorte: s.id })),
    ...(monnaiesDe(fiche).length ? [{ type: 'monnaies' as const, titre: 'Monnaies' }] : []),
    { type: 'bonus', titre: 'Effets actifs' },
    ...(actionsDisponibles(ctx).length ? [{ type: 'actions' as const, titre: 'Actions' }] : []),
    ...textes.map((a) => ({ type: 'texte' as const, titre: a.nom, attribut: a.cle })),
  ];

  // Un bloc qui vise la même chose qu'un bloc déjà retenu (même sorte, même groupe…) n'est
  // proposé qu'une fois : la présentation d'abord, avec ses réglages
  const vus = new Set<string>();
  return [...widgetsDe(ctx), ...generes].filter((w) => {
    const c = cibleDe(w);
    if (vus.has(c)) return false;
    vus.add(c);
    return true;
  });
}

const trie = (l: readonly string[]) => [...l].sort().join(',');

/**
 * Ce qu'un widget affiche, sans ses réglages de présentation (titre, colonnes, champ de
 * regroupement ou de filtre) : deux widgets de même cible sont le même bloc.
 */
export function cibleDe(w: Widget): string {
  switch (w.type) {
    case 'attributs':
      return `attributs:${w.attributs ? trie(w.attributs) : `@${w.groupe ?? ''}`}`;
    case 'ressources':
      return `ressources:${trie(w.attributs)}`;
    case 'possessions':
      return `${w.type}:${w.sorte}`;
    case 'inventaire':
    case 'details':
      return `${w.type}:${trie(w.sortes)}`;
    case 'texte':
      return `texte:${w.attribut}`;
    case 'actions':
      return `actions:${w.actions ? trie(w.actions) : '*'}`;
    // Un seul bloc Compétences : il réunit toute la progression
    default:
      return w.type;
  }
}
