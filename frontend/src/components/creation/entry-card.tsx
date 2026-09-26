'use client';

/**
 * Carte d'une entrée dans la grille de choix (image, nom, premiers
 * modificateurs) et panneau d'aperçu (portrait, description, modificateurs
 * issus des effets, rangs gratuits, marques, choix, champs, arbres).
 */
import type { Entree, Fiche } from '@vtt/rules';
import { AlertTriangle, Check, Link2, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from '../sheet/context';
import { focus, text, textAccent, textMuted, titleFont } from '../sheet/styles';
import { entryImage, summarizeEntry, treesOpenedBy, type EntrySummary } from './entries';
import { TreePreviewButton } from './tree-preview';
import { accentChip, idleCard, mutedChip, plainSummary, RichText, selectedCard } from './ui';

export function EntryCard({
  entry,
  summary,
  selected,
  multiple,
  disabled,
  links,
  prerequisitesMissing,
  onClick,
}: {
  entry: Entree;
  summary: EntrySummary;
  selected: boolean;
  multiple: boolean;
  disabled: boolean;
  links: string[];
  prerequisitesMissing: boolean;
  onClick(): void;
}) {
  const { presentation, system } = useSheet();
  const image = entryImage(presentation, entry.id);
  const trees = treesOpenedBy(system, entry.id);
  const chips = summary.modifiers.slice(0, 3);

  return (
    <div className="relative">
      <button
        type="button"
        role={multiple ? 'checkbox' : 'radio'}
        aria-checked={selected}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'group relative flex w-full flex-col overflow-hidden rounded-xl border text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-40',
          image ? 'aspect-[3/4]' : 'min-h-[9.5rem]',
          selected
            ? cn(selectedCard, 'scale-[1.02]')
            : cn(idleCard, 'opacity-90 hover:opacity-100'),
          focus,
        )}
      >
        {image && (
          <span className="absolute inset-0 bg-[color:var(--fiche-canevas)]">
            <img
              src={image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          </span>
        )}
        <span className="relative flex flex-1 flex-col justify-end gap-2 p-4">
          <span
            className={cn(
              titleFont,
              'pr-6 text-base font-bold leading-tight',
              selected ? textAccent : image ? 'text-white' : text,
            )}
          >
            {entry.nom}
          </span>
          {!image && entry.description && (
            <span className={cn(textMuted, 'line-clamp-3 text-xs leading-relaxed')}>
              {plainSummary(entry.description)}
            </span>
          )}
          {(chips.length > 0 || links.length > 0) && (
            <span className="flex flex-wrap gap-1">
              {links.length > 0 && (
                <span className={accentChip} title={`Lié à ${links.join(', ')}`}>
                  <Link2 className="mr-0.5 h-2.5 w-2.5" />
                  {links[0]}
                </span>
              )}
              {chips.map((m) => (
                <span key={m.key} className={mutedChip}>
                  {m.short} {m.text}
                </span>
              ))}
            </span>
          )}
        </span>
        {selected && (
          <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--fiche-accent)] shadow-lg">
            <Check className="h-4 w-4 text-zinc-950" strokeWidth={3} />
          </span>
        )}
        {prerequisitesMissing && !selected && (
          <span
            className="absolute right-3 top-3 text-amber-400"
            title="Prérequis non rempli pour l’instant"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="sr-only">Prérequis non rempli pour l’instant</span>
          </span>
        )}
      </button>
      {trees.length > 0 && (
        <TreePreviewButton
          trees={trees}
          label={entry.nom}
          className="absolute left-3 top-3 bg-[color:var(--fiche-carte)]"
        />
      )}
    </div>
  );
}

/** Aperçu d'une entrée : portrait, description et tout ce qu'elle donne. */
export function EntryPreview({ sheet, entry }: { sheet: Fiche; entry: Entree | undefined }) {
  const { presentation, system } = useSheet();
  const image = entry ? entryImage(presentation, entry.id) : undefined;

  return (
    <div>
      <div className="relative h-56 overflow-hidden border-b border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] sm:h-72">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-20 w-20 text-[color:var(--fiche-bordure)]" strokeWidth={1} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color:var(--fiche-fond-profond)] via-[color:color-mix(in_srgb,var(--fiche-fond-profond)_50%,transparent)] to-transparent" />
        {entry && (
          <h3
            className={cn(
              titleFont,
              textAccent,
              'absolute inset-x-5 bottom-3 text-xl font-bold leading-tight',
            )}
          >
            {entry.nom}
          </h3>
        )}
      </div>
      <div className="space-y-5 px-5 py-4">
        {!entry ? (
          <p className={cn(textMuted, 'text-sm')}>
            Sélectionnez une carte pour voir son détail ici.
          </p>
        ) : (
          <EntryDetail sheet={sheet} entry={entry} trees={treesOpenedBy(system, entry.id)} />
        )}
      </div>
    </div>
  );
}

function EntryDetail({
  sheet,
  entry,
  trees,
}: {
  sheet: Fiche;
  entry: Entree;
  trees: ReturnType<typeof treesOpenedBy>;
}) {
  const s = summarizeEntry(sheet, entry);
  return (
    <>
      {entry.description && (
        <RichText source={entry.description} className={cn(textMuted, 'text-xs leading-relaxed')} />
      )}

      {s.modifiers.length > 0 && (
        <Section title="Modificateurs">
          <div className="flex flex-wrap gap-1">
            {s.modifiers.map((m) => (
              <span
                key={m.key}
                className={accentChip}
                title={m.conditional ? `${m.name} (sous condition)` : m.name}
              >
                {m.name} {m.text}
                {m.conditional && '*'}
              </span>
            ))}
          </div>
        </Section>
      )}

      {s.ranks.length > 0 && (
        <Section title="Capacités et rangs gratuits">
          <ul className="space-y-1">
            {s.ranks.map((r) => (
              <li key={r.id} className={cn(textMuted, 'text-xs leading-relaxed')}>
                <span className={cn(textAccent, 'font-semibold')}>{r.name}</span>{' '}
                <span className="tabular-nums">({r.value})</span>
                {r.description ? ` : ${plainSummary(r.description)}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {s.tags.map((t) => (
        <Section key={t.tag} title={t.tag}>
          <div className="flex flex-wrap gap-1">
            {t.names.map((n) => (
              <span key={n} className={mutedChip}>
                {n}
              </span>
            ))}
          </div>
        </Section>
      ))}

      {s.choices.filter((c) => c.count > 0).length > 0 && (
        <Section title="À choisir ensuite">
          <ul className="space-y-1">
            {s.choices
              .filter((c) => c.count > 0)
              .map((c) => (
                <li key={c.id} className={cn(text, 'text-xs')}>
                  {c.name} <span className={cn(textMuted, 'tabular-nums')}>× {c.count}</span>
                </li>
              ))}
          </ul>
        </Section>
      )}

      {s.fields.length > 0 && (
        <Section title="Détails">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {s.fields.map((f) => (
              <div key={f.id} className="contents">
                <dt className={textMuted}>{f.name}</dt>
                <dd className={text}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      {trees.length > 0 && (
        <Section title="Arbre">
          <div className="flex items-center gap-2">
            <TreePreviewButton trees={trees} label={entry.nom} />
            <span className={cn(textMuted, 'text-xs')}>{trees.map((t) => t.nom).join(', ')}</span>
          </div>
        </Section>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className={cn(textMuted, 'text-[10px] font-bold uppercase tracking-widest')}>{title}</h4>
      {children}
    </section>
  );
}
