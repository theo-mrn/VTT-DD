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
import { groupesAttributs } from '@/lib/creation';
import { widgetKey } from './model';

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
  const arbres =
    systeme.arbres.size > 0 ||
    [...systeme.achats.values()].some(
      (a) => a.obtient.type === 'rang' || a.obtient.type === 'noeud',
    );

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
    ...sortes
      .filter((s) => s.maximum !== 1)
      .map((s) => ({ type: 'competences' as const, titre: nomDe(s), sorte: s.id })),
    ...(objets.length
      ? [{ type: 'inventaire' as const, titre: 'Inventaire', sortes: objets.map((s) => s.id) }]
      : []),
    ...(arbres ? [{ type: 'arbres' as const, titre: 'Arbres' }] : []),
    ...sortes
      .filter((s) => s.maximum !== 1)
      .map((s) => ({ type: 'possessions' as const, titre: nomDe(s), sorte: s.id })),
    ...(monnaiesDe(fiche).length ? [{ type: 'monnaies' as const, titre: 'Monnaies' }] : []),
    { type: 'bonus', titre: 'Effets actifs' },
    ...(actionsDisponibles(ctx).length ? [{ type: 'actions' as const, titre: 'Actions' }] : []),
    ...textes.map((a) => ({ type: 'texte' as const, titre: a.nom, attribut: a.cle })),
  ];

  const vus = new Set<string>();
  // Un type déjà décliné par la présentation (même sorte, même groupe…) n'est proposé qu'une fois
  const cibles = new Set<string>();
  const cible = (w: Widget) => `${w.type}:${JSON.stringify(ciblesDe(w))}`;
  return [...widgetsDe(ctx), ...generes].filter((w) => {
    const k = widgetKey(w);
    const c = cible(w);
    if (vus.has(k) || cibles.has(c)) return false;
    vus.add(k);
    cibles.add(c);
    return true;
  });
}

/** Ce qu'un widget affiche, sans son titre : deux blocs de même cible sont le même bloc. */
export function ciblesDe(w: Widget): unknown {
  const reste: Record<string, unknown> = { ...w };
  delete reste.titre;
  return Object.fromEntries(Object.entries(reste).sort(([a], [b]) => a.localeCompare(b)));
}
