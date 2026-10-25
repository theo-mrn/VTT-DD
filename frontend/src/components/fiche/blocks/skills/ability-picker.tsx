'use client';

/**
 * Choisir une capacité du catalogue pour un rang de voie (variante maison, docs/entrees-libres.md) :
 * recherche sur la capacité ou sa voie, la voie et le rang d'origine sous chaque capacité, et au
 * clic son aperçu (description) avant de la mettre au rang.
 */
import { useTranslations } from 'next-intl';
import type { Entree, Fiche } from '@vtt/rules';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InputGroup } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { grantsOf, maxRank, pathSortes } from '../tree/model';

/** Au-delà, on demande d'affiner la recherche (le catalogue compte des centaines de capacités). */
const AFFICHEES = 150;

interface Origine {
  voie: string;
  rang: number;
}

export function AbilityPicker({
  rang,
  fiche,
  sortes,
  onChoisir,
  onFermer,
}: Readonly<{
  /** Rang visé (1 à 5) ; null : fermé. */
  rang: number | null;
  fiche: Fiche;
  /** Sortes de capacités proposées (celles qu'une voie libre peut porter). */
  sortes: readonly string[];
  onChoisir(e: Entree): void;
  onFermer(): void;
}>) {
  const t = useTranslations('sheet.skills.freePath');
  const [recherche, setRecherche] = useState('');
  const [choisie, setChoisie] = useState<string | null>(null);
  const ouvert = rang !== null;

  // Voie et rang d'origine de chaque capacité, lus une fois à l'ouverture
  const origines = useMemo(() => {
    const m = new Map<string, Origine>();
    if (!ouvert) return m;
    const { systeme } = fiche;
    for (const sorte of pathSortes(systeme, fiche.etat.type)) {
      const max = maxRank(fiche, sorte) ?? 5;
      for (const v of systeme.entrees.values()) {
        if (v.sorte !== sorte.id) continue;
        for (const g of grantsOf(fiche, v, max))
          if (!m.has(g.entry.id)) m.set(g.entry.id, { voie: v.nom, rang: g.rank });
      }
    }
    return m;
  }, [ouvert, fiche]);

  const capacites = useMemo(
    () =>
      ouvert
        ? [...fiche.systeme.entrees.values()]
            .filter((e) => sortes.includes(e.sorte))
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
        : [],
    [ouvert, fiche, sortes],
  );
  const terme = recherche.trim().toLocaleLowerCase('fr');
  const visibles = terme
    ? capacites.filter((e) =>
        `${e.nom} ${origines.get(e.id)?.voie ?? ''}`.toLocaleLowerCase('fr').includes(terme),
      )
    : capacites;

  const fermer = () => {
    setRecherche('');
    setChoisie(null);
    onFermer();
  };

  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && fermer()}>
      <DialogContent className="flex h-[min(40rem,85dvh)] flex-col gap-3 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('pickTitle', { rank: rang ?? 1 })}</DialogTitle>
          <DialogDescription className="sr-only">{t('pickSearch')}</DialogDescription>
        </DialogHeader>
        <InputGroup
          avant={<Search />}
          autoFocus
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={t('pickSearch')}
          aria-label={t('pickSearch')}
        />
        <ul className="-mx-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 [scrollbar-width:thin]">
          {visibles.slice(0, AFFICHEES).map((e) => {
            const o = origines.get(e.id);
            const ouverte = choisie === e.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  aria-expanded={ouverte}
                  onClick={() => setChoisie(ouverte ? null : e.id)}
                  className={cn(
                    'w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                    ouverte && 'bg-surface-2',
                  )}
                >
                  <span className="block text-sm font-semibold">{e.nom}</span>
                  {o && (
                    <span className="block text-xs text-muted-foreground">
                      {t('origin', { path: o.voie, rank: o.rang })}
                    </span>
                  )}
                </button>
                {ouverte && (
                  <div className="mx-3 mb-2 mt-1 space-y-2 border-l-2 border-primary/40 pl-3">
                    {e.description && (
                      <p className="max-h-48 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                        {e.description}
                      </p>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        onChoisir(e);
                        fermer();
                      }}
                    >
                      {t('putAtRank', { rank: rang ?? 1 })}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {visibles.length > AFFICHEES && (
            <li className="px-3 py-3 text-center text-xs text-subtle">{t('refine')}</li>
          )}
          {visibles.length === 0 && (
            <li className="py-10 text-center text-sm text-subtle">{t('noAbility')}</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
