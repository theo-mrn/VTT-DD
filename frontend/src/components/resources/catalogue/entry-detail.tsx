'use client';

/**
 * Détail d'une entrée du catalogue : illustration, champs, description, effets en clair et
 * entrées liées, navigables (retour à l'entrée précédente). Une entrée liée qui accorde
 * elle-même des rangs (une voie) est dépliée avec ce qu'elle accorde.
 */
import type { Entree, Presentation, SystemeCharge } from '@vtt/rules';
import { ArrowLeft, ChevronRight, ListTree } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { imageEntree } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import {
  effectLines,
  fieldLines,
  grantsRanks,
  linkGroups,
  sheetFor,
  type Link,
} from '../model/catalogue';
import { CatalogueText, Thumb } from '../parts';

export function EntryDetail({
  systeme,
  presentation,
  entry,
  trail,
  onOpen,
  onBack,
  actions,
}: Readonly<{
  systeme: SystemeCharge;
  presentation: Presentation | null;
  entry: Entree;
  /** Entrées ouvertes avant celle-ci (fil d'Ariane). */
  trail: Entree[];
  onOpen(id: string): void;
  onBack?: () => void;
  /** Actions propres à l'onglet (ajout à l'inventaire…). */
  actions?: ReactNode;
}>) {
  const fiche = useMemo(() => sheetFor(systeme, entry), [systeme, entry]);
  const sorte = systeme.sortes.get(entry.sorte);
  const image = imageEntree(presentation, entry.id);
  const fields = useMemo(() => (fiche ? fieldLines(fiche, entry) : []), [fiche, entry]);
  const effects = useMemo(() => (fiche ? effectLines(fiche, entry) : []), [fiche, entry]);
  const groups = useMemo(
    () => (fiche ? linkGroups(fiche, entry, presentation) : []),
    [fiche, entry, presentation],
  );

  return (
    <article className="flex flex-col">
      {(onBack || trail.length > 0) && (
        <nav
          aria-label="Entrées ouvertes"
          className="flex items-center gap-1 border-b border-border px-3 py-2 text-xs text-subtle"
        >
          {onBack && (
            <Button variant="ghost" size="xs" onClick={onBack}>
              <ArrowLeft />
              Retour
            </Button>
          )}
          <span className="min-w-0 truncate">
            {trail.map((t) => t.nom).join(' › ')}
            {trail.length > 0 && ' › '}
            <span className="text-muted-foreground">{entry.nom}</span>
          </span>
        </nav>
      )}

      {image && (
        <div className="relative h-44 overflow-hidden border-b border-border bg-surface-2 sm:h-56">
          <Thumb src={image} alt="" className="size-full object-cover" fallback={null} />
        </div>
      )}

      <div className="space-y-5 p-5">
        <header className="space-y-1.5 pr-8 lg:pr-0">
          {sorte && <p className="text-xs font-medium text-primary">{sorte.nom}</p>}
          <h3 className="text-lg font-semibold leading-tight tracking-tight">{entry.nom}</h3>
          {fields.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {fields.map((f) => (
                <Badge key={f.id} taille="md">
                  {f.name} : <span className="text-foreground">{f.value}</span>
                </Badge>
              ))}
            </div>
          )}
        </header>

        {actions}

        {entry.description && <CatalogueText text={entry.description} />}

        {effects.length > 0 && (
          <section aria-label="Effets">
            <h4 className="mb-2 text-sm font-semibold">Effets</h4>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface-2/40">
              {effects.map((e, i) => (
                <li key={i} className="px-3 py-2">
                  <p className="text-[13px] font-medium">{e.label}</p>
                  {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {groups.map((g) => (
          <section key={g.key} aria-label={g.title}>
            <h4 className="text-sm font-semibold">{g.title}</h4>
            {g.caption && <p className="mt-0.5 text-xs text-muted-foreground">{g.caption}</p>}
            <div className="mt-2 space-y-2">
              {g.links.some((l) => grantsRanks(l.entry)) ? (
                g.links.map((l) =>
                  grantsRanks(l.entry) ? (
                    <GrantCard
                      key={l.entry.id}
                      systeme={systeme}
                      presentation={presentation}
                      link={l}
                      onOpen={onOpen}
                    />
                  ) : (
                    <LinkRow key={l.entry.id} systeme={systeme} link={l} onOpen={onOpen} />
                  ),
                )
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {g.links.map((l) => (
                    <li key={`${l.entry.id}:${l.note ?? ''}`}>
                      <LinkRow systeme={systeme} link={l} onOpen={onOpen} flat />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

/** Ligne d'une entrée liée : nom, précision (« Rang 2 »), sorte ; ouvre son détail. */
function LinkRow({
  systeme,
  link,
  onOpen,
  flat = false,
}: Readonly<{
  systeme: SystemeCharge;
  link: Link;
  onOpen(id: string): void;
  flat?: boolean;
}>) {
  const sorte = systeme.sortes.get(link.entry.sorte);
  return (
    <button
      type="button"
      onClick={() => onOpen(link.entry.id)}
      className={cn(
        'group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
        !flat && 'rounded-xl border border-border',
      )}
    >
      {link.note && (
        <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary-strong">
          {link.note}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{link.entry.nom}</span>
      {sorte && <span className="hidden shrink-0 text-xs text-subtle sm:inline">{sorte.nom}</span>}
      <ChevronRight className="size-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/** Entrée liée qui accorde des rangs (voie) : ses capacités, au rang voulu, cliquables. */
function GrantCard({
  systeme,
  presentation,
  link,
  onOpen,
}: Readonly<{
  systeme: SystemeCharge;
  presentation: Presentation | null;
  link: Link;
  onOpen(id: string): void;
}>) {
  const fiche = useMemo(() => sheetFor(systeme, link.entry), [systeme, link.entry]);
  const accordes = useMemo(
    () =>
      fiche
        ? (linkGroups(fiche, link.entry, presentation).find((g) => g.key === 'rangs')?.links ?? [])
        : [],
    [fiche, link.entry, presentation],
  );
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2/40">
      <button
        type="button"
        onClick={() => onOpen(link.entry.id)}
        className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <ListTree className="size-3.5 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{link.entry.nom}</span>
        {link.note && <span className="text-xs text-subtle">{link.note}</span>}
        <ChevronRight className="size-3.5 text-subtle" />
      </button>
      <ol className="divide-y divide-border">
        {accordes.map((a) => (
          <li key={`${a.entry.id}:${a.note ?? ''}`}>
            <LinkRow systeme={systeme} link={a} onOpen={onOpen} flat />
          </li>
        ))}
      </ol>
    </div>
  );
}
