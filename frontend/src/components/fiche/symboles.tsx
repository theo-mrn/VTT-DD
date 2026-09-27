'use client';

import type { DeSymbole, Presentation, SystemeCharge } from '@vtt/rules';
import {
  Check,
  Circle,
  Moon,
  Skull,
  Star,
  Sun,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Icônes que la présentation d'un système peut nommer (`symboles.*.icone`).
 * Un nom inconnu retombe sur une pastille de la couleur déclarée.
 */
const ICONES: Record<string, LucideIcon> = {
  check: Check,
  x: X,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  star: Star,
  skull: Skull,
  sun: Sun,
  moon: Moon,
};

/** Résultats nets d'un jet à symboles (succès, avantages…), avec icône et couleur de la présentation. */
export function ResultatsSymboles({
  systeme,
  presentation,
  resultats,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  resultats: Record<string, number>;
}) {
  const declares = systeme.source.des?.resultats ?? [];
  const non0 = declares.filter((r) => (resultats[r.cle] ?? 0) > 0);
  if (non0.length === 0)
    return <p className="text-sm text-subtle">Aucun symbole net : les dés s&apos;annulent.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {non0.map((r) => {
        const a = presentation?.symboles[r.cle];
        const Icone = (a && ICONES[a.icone]) || Circle;
        return (
          <span
            key={r.cle}
            className="flex items-center gap-2 rounded-xl border px-3 py-2"
            style={{
              borderColor: a ? `${a.couleur}55` : undefined,
              background: a ? `${a.couleur}14` : undefined,
            }}
          >
            <Icone className="size-4" style={{ color: a?.couleur }} />
            <span className="font-mono text-lg font-bold tabular" style={{ color: a?.couleur }}>
              {resultats[r.cle]}
            </span>
            <span className="text-[13px] text-muted-foreground">{a?.court ?? r.nom}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Dés à symboles lancés : une pastille par dé, à la couleur de sa sorte, avec ses symboles. */
export function DesSymboles({
  systeme,
  presentation,
  des,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  des: DeSymbole[];
}) {
  const noms = new Map((systeme.source.des?.sortes ?? []).map((s) => [s.id, s.nom]));
  return (
    <div className="flex flex-wrap gap-1.5">
      {des.map((d, i) => {
        const apparence = presentation?.des?.sortes[d.de];
        const symboles = Object.entries(d.symboles).filter(([, n]) => n > 0);
        return (
          <span
            key={i}
            title={`${apparence?.court ?? noms.get(d.de) ?? d.de} : ${symboles.map(([s, n]) => `${n} ${s}`).join(', ') || 'face vide'}`}
            className={cn(
              'flex h-9 min-w-9 items-center justify-center gap-0.5 rounded-lg border px-1.5',
            )}
            style={{
              borderColor: apparence ? `${apparence.couleur}88` : undefined,
              background: apparence ? `${apparence.couleur}22` : undefined,
            }}
          >
            {symboles.length === 0 ? (
              <span className="text-[10px] text-subtle">—</span>
            ) : (
              symboles.map(([s, n]) => {
                const a = presentation?.symboles[s];
                const Icone = (a && ICONES[a.icone]) || Circle;
                return Array.from({ length: n }, (_, k) => (
                  <Icone
                    key={`${s}-${k}`}
                    className="size-3.5"
                    style={{ color: a?.couleur ?? apparence?.couleur }}
                  />
                ));
              })
            )}
          </span>
        );
      })}
    </div>
  );
}
