/**
 * Instantané d'une fiche pour l'export PDF : ce que montre la fiche à l'écran (mêmes blocs,
 * même ordre, mêmes droits de lecture), réduit à des textes prêts à poser sur une page. Aucun
 * style ici : les gabarits (`pdf/`) habillent tous le même instantané. Rien de propre à un
 * système : tout vient de la présentation du système et des valeurs calculées.
 */
import { sortesCompetences, soldes, type Widget } from '@vtt/rules';
import { afficherModificateur, afficherValeur } from '@/lib/creation';
import { clesAttributs, clesRessources, widgetsDe, type ContexteFiche } from '../widgets';

export interface SheetItem {
  name: string;
  note?: string;
}

export type SheetSection =
  | {
      kind: 'stats';
      title: string;
      items: { label: string; short?: string; value: string; mod?: string }[];
    }
  | { kind: 'resources'; title: string; items: { label: string; value: string; max?: string }[] }
  | { kind: 'list'; title: string; groups: { title?: string; items: SheetItem[] }[] }
  | { kind: 'currencies'; title: string; items: { label: string; value: string }[] }
  | { kind: 'text'; title: string; text: string };

export interface SheetSnapshot {
  name: string;
  portraitUrl: string | null;
  system: string;
  concept: string | null;
  details: { label: string; value: string }[];
  sections: SheetSection[];
}

type Possession = ContexteFiche['fiche']['possessions'] extends Map<string, infer P> ? P : never;

const parNom = (a: Possession, b: Possession) => a.entree.nom.localeCompare(b.entree.nom, 'fr');

/** Une entrée possédée : son nom, son rang (entrée à rangs) ou sa quantité (au-delà de 1). */
function item(p: Possession, rangLabel: (n: number) => string): SheetItem {
  if (p.sorte.rangs && p.rang > 0) return { name: p.entree.nom, note: rangLabel(p.rang) };
  if (p.quantite > 1) return { name: p.entree.nom, note: `×${p.quantite}` };
  return { name: p.entree.nom };
}

/** Possessions de ces sortes, rangées par sorte (un groupe par sorte quand il y en a plusieurs). */
function groupesDe(
  ctx: ContexteFiche,
  sortes: readonly string[],
  rangLabel: (n: number) => string,
): { title?: string; items: SheetItem[] }[] {
  const toutes = [...ctx.fiche.possessions.values()].filter(
    (p) => sortes.includes(p.sorte.id) && (p.rang > 0 || !p.sorte.rangs || p.possession),
  );
  const groupes = sortes
    .map((id) => {
      const liste = toutes.filter((p) => p.sorte.id === id).sort(parNom);
      return {
        title: ctx.systeme.sortes.get(id)?.nom ?? id,
        items: liste.map((p) => item(p, rangLabel)),
      };
    })
    .filter((g) => g.items.length > 0);
  return groupes.length === 1 ? [{ items: groupes[0]!.items }] : groupes;
}

function texteChoix(ctx: ContexteFiche, cle: string): string | null {
  const a = ctx.fiche.entite.attributs.get(cle);
  const v = ctx.fiche.valeurs.get(cle);
  if (!a || !v || v.valeur === '' || v.valeur === undefined) return null;
  if (a.nature === 'choix')
    return a.options.find((o) => o.valeur === v.valeur)?.nom ?? String(v.valeur);
  return String(v.valeur);
}

function section(
  ctx: ContexteFiche,
  w: Widget,
  t: { rank: (n: number) => string; currency: string },
): SheetSection | null {
  const { fiche } = ctx;
  switch (w.type) {
    case 'attributs': {
      const items = clesAttributs(ctx, w).flatMap((cle) => {
        const a = fiche.entite.attributs.get(cle);
        const v = fiche.valeurs.get(cle);
        if (!a || !v) return [];
        const mod = afficherModificateur(v.modificateur);
        return [
          {
            label: a.nom,
            ...(a.abrege ? { short: a.abrege } : {}),
            value: afficherValeur(v),
            ...(mod ? { mod } : {}),
          },
        ];
      });
      return items.length ? { kind: 'stats', title: w.titre, items } : null;
    }
    case 'ressources': {
      const items = clesRessources(ctx, w).flatMap((cle) => {
        const a = fiche.entite.attributs.get(cle);
        const v = fiche.valeurs.get(cle);
        if (!a || !v) return [];
        const max = a.nature === 'ressource' && v.max !== undefined ? String(v.max) : undefined;
        return [{ label: a.nom, value: afficherValeur(v), ...(max ? { max } : {}) }];
      });
      return items.length ? { kind: 'resources', title: w.titre, items } : null;
    }
    case 'possessions': {
      const groups = groupesDe(ctx, [w.sorte], t.rank);
      return groups.length ? { kind: 'list', title: w.titre, groups } : null;
    }
    case 'inventaire': {
      const groups = groupesDe(ctx, w.sortes, t.rank);
      return groups.length ? { kind: 'list', title: w.titre, groups } : null;
    }
    case 'competences': {
      // Sortes du bloc ; absentes : celles que la fiche possède avec des rangs, ou accordées
      const declarees = sortesCompetences(w);
      const sortes = declarees.length
        ? declarees
        : [
            ...new Set(
              [...fiche.possessions.values()]
                .filter((p) => p.sorte.rangs || p.sources.length > 0)
                .map((p) => p.sorte.id),
            ),
          ];
      const groups = groupesDe(ctx, sortes, t.rank);
      return groups.length ? { kind: 'list', title: w.titre, groups } : null;
    }
    case 'monnaies': {
      const items = soldes(fiche).map((m) => ({ label: m.monnaie.nom, value: String(m.solde) }));
      return items.length ? { kind: 'currencies', title: w.titre || t.currency, items } : null;
    }
    case 'texte': {
      const v = fiche.valeurs.get(w.attribut)?.valeur;
      return typeof v === 'string' && v.trim() ? { kind: 'text', title: w.titre, text: v } : null;
    }
    // Profil : en-tête de la page ; bonus et actions : rien d'utile sur papier
    case 'details':
    case 'bonus':
    case 'actions':
      return null;
  }
}

export function buildSheetSnapshot(
  ctx: ContexteFiche,
  extra: {
    system: string;
    concept?: string | null;
    rank: (n: number) => string;
    currency: string;
  },
): SheetSnapshot {
  const widgets = widgetsDe(ctx);
  const details = widgets.flatMap((w) => {
    if (w.type !== 'details') return [];
    const uniques = [...ctx.fiche.possessions.values()]
      .filter((p) => w.sortes.includes(p.sorte.id))
      .map((p) => ({ label: p.sorte.nom, value: p.entree.nom }));
    const textes = w.attributs.flatMap((cle) => {
      const value = texteChoix(ctx, cle);
      const label = ctx.fiche.entite.attributs.get(cle)?.nom;
      return value && label ? [{ label, value }] : [];
    });
    return [...uniques, ...textes];
  });
  return {
    name: ctx.personnage.name,
    portraitUrl: ctx.personnage.portraitUrl ?? null,
    system: extra.system,
    concept: extra.concept?.trim() || null,
    details,
    sections: widgets
      .map((w) => section(ctx, w, extra))
      .filter((s): s is SheetSection => s !== null),
  };
}
