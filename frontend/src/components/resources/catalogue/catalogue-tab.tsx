'use client';

/**
 * Onglet Capacités : les sections déclarées par le système (races, profils, voies de
 * prestige, carrières, talents…), une recherche plein texte qui descend dans ce que chaque
 * entrée accorde, un filtre par groupe, et le détail navigable de l'entrée choisie.
 */
import type { Entree, Presentation, SystemeCharge } from '@vtt/rules';
import { BookOpen, SearchX } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { SelectField } from '@/components/ui/select';
import { imageEntree } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import {
  groupEntries,
  groupOf,
  sectionEntries,
  searchEntry,
  type SearchHit,
} from '../model/catalogue';
import { Chips, MasterDetail, Notice, SearchField, Thumb, Toolbar } from '../parts';
import { EntryDetail } from './entry-detail';
import { stripTags } from '@/lib/strip-tags';

const TOUS = '';

/** Première phrase lisible d'une description (sans marques de mise en forme). */
function extrait(texte: string | undefined): string {
  if (!texte) return '';
  const t = stripTags(texte, ' ')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/\*\*|__/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

export function CatalogueTab({
  systeme,
  presentation,
}: Readonly<{
  systeme: SystemeCharge;
  presentation: Presentation | null;
}>) {
  const sections = presentation?.references.capacites?.sections ?? [];
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState('');
  const recherche = useDeferredValue(query);
  const [group, setGroup] = useState(TOUS);
  /** Entrées ouvertes, de la première (choisie dans la liste) à celle affichée. */
  const [stack, setStack] = useState<string[]>([]);
  const section = sections[Math.min(index, sections.length - 1)];

  const entries = useMemo(
    () => (section ? sectionEntries(systeme, section) : []),
    [systeme, section],
  );
  const counts = useMemo(
    () => sections.map((s) => sectionEntries(systeme, s).length),
    [systeme, sections],
  );
  const groupNames = useMemo(
    () =>
      section
        ? groupEntries(systeme, section, entries)
            .map((g) => g.name)
            .filter((n): n is string => n !== null)
        : [],
    [systeme, section, entries],
  );
  const hits = useMemo(() => {
    const r = new Map<string, SearchHit>();
    if (!section) return r;
    for (const e of entries) {
      if (group && groupOf(systeme, section, e) !== group) continue;
      const h = searchEntry(systeme, e, recherche);
      if (h) r.set(e.id, h);
    }
    return r;
  }, [systeme, section, entries, group, recherche]);
  const groups = useMemo(
    () =>
      section
        ? groupEntries(
            systeme,
            section,
            entries.filter((e) => hits.has(e.id)),
          )
        : [],
    [systeme, section, entries, hits],
  );

  if (!section) return null;

  const ouvertes = stack
    .map((id) => systeme.entrees.get(id))
    .filter((e): e is Entree => e !== undefined);
  const courante = ouvertes.at(-1) ?? null;
  const changerSection = (v: string) => {
    setIndex(Number(v));
    setGroup(TOUS);
    setStack([]);
  };

  const liste =
    hits.size === 0 ? (
      <Notice
        icon={SearchX}
        title="Aucun résultat"
        description={
          recherche ? `Rien ne correspond à « ${recherche} » dans ${section.titre}.` : undefined
        }
      />
    ) : (
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.name ?? '—'} aria-label={g.name ?? section.titre}>
            {g.name !== null && (
              <h3 className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                {g.name}
                <span className="font-normal normal-case">{g.entries.length}</span>
              </h3>
            )}
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {g.entries.map((e) => (
                <li key={e.id}>
                  <EntryRow
                    entry={e}
                    image={imageEntree(presentation, e.id)}
                    via={hits.get(e.id)?.via ?? []}
                    selected={stack[0] === e.id}
                    onSelect={() => setStack([e.id])}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );

  return (
    <div>
      <Toolbar>
        {sections.length > 1 ? (
          <Chips
            label="Sections"
            value={String(index)}
            onChange={changerSection}
            options={sections.map((s, i) => ({
              value: String(i),
              label: s.titre,
              count: counts[i],
            }))}
          />
        ) : (
          <span />
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {groupNames.length > 1 && (
            <SelectField
              value={group}
              onValueChange={setGroup}
              aria-label="Filtrer par groupe"
              className="h-9 sm:w-52"
              options={[
                { valeur: TOUS, nom: 'Tous les groupes' },
                ...groupNames.map((n) => ({ valeur: n, nom: n })),
              ]}
            />
          )}
          <SearchField
            value={query}
            onChange={setQuery}
            label={`Rechercher dans ${section.titre}`}
            placeholder="Nom, texte d’une capacité…"
          />
        </div>
      </Toolbar>

      <MasterDetail
        list={liste}
        open={courante !== null}
        title={courante?.nom ?? section.titre}
        onClose={() => setStack([])}
        placeholder={
          <div className="p-5">
            <Notice
              icon={BookOpen}
              title="Choisissez une entrée"
              description="Sa description, ses effets et ce qu’elle accorde s’affichent ici."
            />
          </div>
        }
        detail={
          courante && (
            <EntryDetail
              key={courante.id}
              systeme={systeme}
              presentation={presentation}
              entry={courante}
              trail={ouvertes.slice(0, -1)}
              onOpen={(id) => setStack((s) => [...s, id])}
              onBack={stack.length > 1 ? () => setStack((s) => s.slice(0, -1)) : undefined}
            />
          )
        }
      />
    </div>
  );
}

function EntryRow({
  entry,
  image,
  via,
  selected,
  onSelect,
}: Readonly<{
  entry: Entree;
  image: string | null;
  via: Entree[];
  selected: boolean;
  onSelect(): void;
}>) {
  const suite = via.length > 3 ? '…' : '';
  const texte = via.length
    ? `Correspond : ${via
        .slice(0, 3)
        .map((v) => v.nom)
        .join(', ')}${suite}`
    : extrait(entry.description);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
        selected ? 'bg-primary/10' : 'hover:bg-surface-2',
      )}
    >
      {image && (
        <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          <Thumb src={image} alt="" width={36} className="size-full object-cover" fallback={null} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[13px] font-medium',
            selected ? 'text-primary-strong' : 'text-foreground',
          )}
        >
          {entry.nom}
        </span>
        {texte && (
          <span
            className={cn(
              'line-clamp-1 text-xs',
              via.length ? 'text-primary-strong/80' : 'text-muted-foreground',
            )}
          >
            {texte}
          </span>
        )}
      </span>
    </button>
  );
}
