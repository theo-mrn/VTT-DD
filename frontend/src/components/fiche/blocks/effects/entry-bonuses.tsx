'use client';

/**
 * Bonus d'une entrée, en lecture (fenêtre d'une compétence, d'un nœud d'arbre, d'une
 * possession du profil) : une ligne par effet, avec son état. On ne les active ni ne les
 * coupe ici : c'est le rôle du bloc Bonus, vers lequel la liste renvoie.
 */
import type { Entree, Fiche } from '@vtt/rules';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { texteEffet } from '@/lib/creation';
import { cn } from '@/lib/utils';
import { rollEffectText } from '../skills/model';
import { effetsDeLEntree, libelleEffet, precisionEffet, raisonInactif } from './model';

interface Ligne {
  cle: string;
  texte: string;
  precision: string | null;
  statut: 'actif' | 'desactive' | 'inactif';
  raison: string | null;
}

function lignes(fiche: Fiche, entry: Entree): Ligne[] {
  const p = fiche.possessions.get(entry.id);
  const possedee = p && (!p.sorte.rangs || p.rang > 0);
  if (possedee)
    return effetsDeLEntree(fiche, entry.id).map((e) => ({
      cle: e.cle,
      texte: libelleEffet(fiche, e),
      precision: precisionEffet(e),
      statut: e.statut,
      raison: e.statut === 'inactif' ? raisonInactif(e) : null,
    }));
  // Entrée pas encore possédée : ce que ses effets du catalogue donneraient
  const rang = Math.max(p?.rang ?? 0, 1);
  return entry.effets.flatMap((effet, i) => {
    if (effet.sur === 'marque') return [];
    const texte =
      effet.sur === 'jet' ? rollEffectText(fiche, effet, rang) : texteEffet(fiche, effet);
    return texte
      ? [{ cle: `${entry.id}/${i}`, texte, precision: null, statut: 'inactif', raison: null }]
      : [];
  });
}

export function EntryBonuses({
  fiche,
  entry,
  onManage,
}: {
  fiche: Fiche;
  entry: Entree;
  /** Amène le bloc Bonus à l'écran (absent : il n'est pas sur la fiche). */
  onManage?: (() => void) | undefined;
}) {
  const liste = useMemo(() => lignes(fiche, entry), [fiche, entry]);
  const possedee = fiche.possessions.has(entry.id);
  // Marques d'entrées (compétences de carrière…) : des effets, pas des bonus
  const marques = entry.effets
    .filter((e) => e.sur === 'marque')
    .map((e) => texteEffet(fiche, e))
    .filter((t): t is string => !!t);
  if (!liste.length && !marques.length) return null;
  return (
    <div className="space-y-3">
      {liste.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">Bonus</p>
          <ul className="space-y-0.5 text-[13px]">
            {liste.map((l) => (
              <li
                key={l.cle}
                className={cn(
                  'flex items-baseline gap-2',
                  l.statut === 'actif' ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 -translate-y-px self-center rounded-full',
                    l.statut === 'actif' ? 'bg-primary' : 'bg-surface-3',
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className={cn(l.statut === 'desactive' && 'line-through')}>{l.texte}</span>
                  {l.precision && <span className="text-xs text-subtle"> · {l.precision}</span>}
                  {possedee && l.statut === 'desactive' && (
                    <span className="text-xs text-subtle"> · désactivé</span>
                  )}
                  {l.raison && <span className="text-xs text-subtle"> · {l.raison}</span>}
                </span>
              </li>
            ))}
          </ul>
          {possedee && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-subtle">
              Ces bonus s’activent ou se désactivent dans le bloc Bonus.
              {onManage && (
                <button
                  type="button"
                  onClick={onManage}
                  className="inline-flex items-center gap-0.5 rounded font-medium text-primary-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  Y aller
                  <ArrowRight className="size-3" aria-hidden />
                </button>
              )}
            </p>
          )}
        </div>
      )}
      {marques.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
            Effets
          </p>
          <ul className="space-y-0.5 text-[13px] text-muted-foreground">
            {marques.map((t, i) => (
              <li key={`${t}-${i}`}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
