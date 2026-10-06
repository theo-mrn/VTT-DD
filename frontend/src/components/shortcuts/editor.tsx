'use client';

/**
 * Éditeur des raccourcis (docs/raccourcis.md § 5), sur la page Profil › Raccourcis et à la
 * table : toutes les commandes par section, la touche se change d'un clic, un conflit se
 * signale sur la ligne (« Remplacer » au moment de choisir), « Aucune », « Rétablir », et les
 * raccourcis créés (une formule de dés sur une touche).
 */
import { AlertTriangle, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import { useMacros } from '@/components/des/macros';
import { bindingLabel } from '@/lib/shortcuts/chord';
import { useShortcutPrefs } from '@/lib/shortcuts/hooks';
import {
  findConflicts,
  forRole,
  type ShortcutDescriptor,
  type ShortcutRole,
} from '@/lib/shortcuts/registry';
import {
  bindingOf,
  CUSTOM_MAX,
  shortcutPrefsStore,
  withBinding,
  type ShortcutPrefs,
} from '@/lib/shortcuts/store';
import { cn } from '@/lib/utils';
import { allShortcuts, SECTIONS } from './catalog';
import { clashesFor, replaceBinding, resetAll } from './editor-model';
import { ShortcutRecorder } from './recorder';

interface Pending {
  descriptor: ShortcutDescriptor;
  binding: string;
  others: ShortcutDescriptor[];
}

const save = (next: ShortcutPrefs) => shortcutPrefsStore().set(next);

export function ShortcutsEditor({
  role = null,
}: Readonly<{
  /** Rôle à la table : seules ses commandes ; null (profil) : toutes. */
  role?: ShortcutRole | null;
}>) {
  const prefs = useShortcutPrefs();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  const list = useMemo(() => forRole(allShortcuts(prefs), role), [prefs, role]);
  const conflicts = useMemo(
    () => findConflicts(list.map((d) => ({ descriptor: d, binding: bindingOf(prefs, d) }))),
    [list, prefs],
  );
  const byId = useMemo(() => new Map(list.map((d) => [d.id, d])), [list]);

  const q = query.trim().toLowerCase();
  const shown = q ? list.filter((d) => d.label.toLowerCase().includes(q)) : list;

  const record = (d: ShortcutDescriptor, binding: string) => {
    const others = clashesFor(list, prefs, d, binding);
    if (others.length) setPending({ descriptor: d, binding, others });
    else save(withBinding(prefs, d, binding));
  };

  const replace = (p: Pending) => {
    save(replaceBinding(prefs, p.descriptor, p.binding, p.others));
    setPending(null);
  };

  const customized =
    Object.keys(prefs.bindings).length > 0 || prefs.custom.some((c) => c.binding !== null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher"
            aria-label="Chercher un raccourci"
            className="pl-8"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!customized}
          onClick={() => save(resetAll(prefs))}
        >
          <RotateCcw />
          Tout rétablir
        </Button>
      </div>

      {SECTIONS.map(({ scope, title }) => {
        const rows = shown.filter((d) => d.scope === scope && !d.id.startsWith('custom.'));
        if (!rows.length) return null;
        return (
          <section key={scope} aria-label={title}>
            <h3 className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </h3>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((d) => (
                <Row
                  key={d.id}
                  descriptor={d}
                  prefs={prefs}
                  role={role}
                  conflicts={(conflicts.get(d.id) ?? []).map((id) => byId.get(id)!.label)}
                  pending={pending?.descriptor.id === d.id ? pending : null}
                  onRecord={(b) => record(d, b)}
                  onReplace={replace}
                  onCancel={() => setPending(null)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <CustomSection
        prefs={prefs}
        query={q}
        conflicts={conflicts}
        byId={byId}
        pending={pending}
        onRecord={record}
        onReplace={replace}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}

function Row({
  descriptor: d,
  prefs,
  role,
  conflicts,
  pending,
  onRecord,
  onReplace,
  onCancel,
  extra,
}: Readonly<{
  descriptor: ShortcutDescriptor;
  prefs: ShortcutPrefs;
  role: ShortcutRole | null;
  conflicts: string[];
  pending: Pending | null;
  onRecord(binding: string): void;
  onReplace(p: Pending): void;
  onCancel(): void;
  extra?: ReactNode;
}>) {
  const binding = bindingOf(prefs, d);
  const changed = !d.fixed && binding !== d.defaultBinding && !d.id.startsWith('custom.');
  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn('min-w-0 flex-1 truncate text-[13px]', d.fixed && 'text-muted-foreground')}
        >
          {d.label}
        </span>
        {!role && d.roles?.length === 1 && d.roles[0] === 'gm' && (
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            MJ
          </span>
        )}
        {conflicts.length > 0 && (
          <Info texte={`Aussi : ${conflicts.join(', ')}`}>
            <AlertTriangle className="size-4 shrink-0 text-destructive" aria-label="Conflit" />
          </Info>
        )}
        {d.fixed ? (
          <span className="flex h-7 min-w-16 items-center justify-center">
            <Kbd>{d.fixedLabel ?? bindingLabel(binding)}</Kbd>
          </span>
        ) : (
          <ShortcutRecorder
            binding={binding}
            label={d.label}
            single={d.single}
            conflict={conflicts.length > 0}
            onRecord={onRecord}
          />
        )}
        {extra}
        {!d.fixed && !extra && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Options de ${d.label}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={binding === null}
                onSelect={() => shortcutPrefsStore().set(withBinding(prefs, d, null))}
              >
                Aucune
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!changed}
                onSelect={() => shortcutPrefsStore().set(withBinding(prefs, d, d.defaultBinding))}
              >
                Rétablir{' '}
                {d.defaultBinding ? (
                  <Kbd className="ml-auto">{bindingLabel(d.defaultBinding)}</Kbd>
                ) : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {pending && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs">
          <Kbd>{bindingLabel(pending.binding)}</Kbd>
          <span className="min-w-0 flex-1 text-muted-foreground">
            Déjà : {pending.others.map((o) => o.label).join(', ')}
          </span>
          {pending.others.some((o) => o.fixed) ? null : (
            <Button size="xs" onClick={() => onReplace(pending)}>
              Remplacer
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      )}
    </li>
  );
}

/** Mes raccourcis : une formule de dés sur une touche, lancée par la table de dés affichée. */
function CustomSection({
  prefs,
  query,
  conflicts,
  byId,
  pending,
  onRecord,
  onReplace,
  onCancel,
}: Readonly<{
  prefs: ShortcutPrefs;
  query: string;
  conflicts: Map<string, string[]>;
  byId: Map<string, ShortcutDescriptor>;
  pending: Pending | null;
  onRecord(d: ShortcutDescriptor, binding: string): void;
  onReplace(p: Pending): void;
  onCancel(): void;
}>) {
  const [adding, setAdding] = useState(false);
  const rows = prefs.custom.filter(
    (c) => !query || c.label.toLowerCase().includes(query) || c.formula.includes(query),
  );
  const remove = (id: string) =>
    shortcutPrefsStore().set({ ...prefs, custom: prefs.custom.filter((c) => c.id !== id) });

  return (
    <section aria-label="Mes raccourcis">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Mes raccourcis
        </h3>
        <Button
          variant="ghost"
          size="xs"
          disabled={prefs.custom.length >= CUSTOM_MAX}
          onClick={() => setAdding(true)}
        >
          <Plus />
          Ajouter
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {adding && <CustomForm prefs={prefs} onDone={() => setAdding(false)} />}
        {rows.map((c) => {
          const d = byId.get(`custom.${c.id}`)!;
          return (
            <Row
              key={c.id}
              descriptor={{ ...d, label: `${c.label} · ${c.formula}` }}
              prefs={prefs}
              role={null}
              conflicts={(conflicts.get(d.id) ?? []).map((id) => byId.get(id)!.label)}
              pending={pending?.descriptor.id === d.id ? pending : null}
              onRecord={(b) => onRecord(d, b)}
              onReplace={onReplace}
              onCancel={onCancel}
              extra={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Supprimer ${c.label}`}
                  onClick={() => remove(c.id)}
                >
                  <Trash2 />
                </Button>
              }
            />
          );
        })}
        {!adding && rows.length === 0 && (
          <li className="px-3 py-3 text-center text-xs text-subtle">Aucun</li>
        )}
      </ul>
    </section>
  );
}

function CustomForm({ prefs, onDone }: Readonly<{ prefs: ShortcutPrefs; onDone(): void }>) {
  const { macros } = useMacros();
  const [label, setLabel] = useState('');
  const [formula, setFormula] = useState('');
  const ok = label.trim() && formula.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    shortcutPrefsStore().set({
      ...prefs,
      custom: [
        ...prefs.custom,
        {
          id: crypto.randomUUID(),
          kind: 'roll',
          label: label.trim().slice(0, 60),
          formula: formula.trim().slice(0, 200),
          binding: null,
        },
      ],
    });
    onDone();
  };

  return (
    <li className="px-3 py-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nom"
          aria-label="Nom du raccourci"
          maxLength={60}
          className="h-8 w-36"
        />
        <Input
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="1d20 + mod(@FOR)"
          aria-label="Formule"
          maxLength={200}
          className="h-8 min-w-40 flex-1 font-mono"
        />
        {macros.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm">
                Macro
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Mes macros</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {macros.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onSelect={() => {
                    setFormula(m.formula);
                    if (!label.trim()) setLabel(m.name);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{m.formula}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button type="submit" size="sm" disabled={!ok}>
          Ajouter
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Annuler
        </Button>
      </form>
    </li>
  );
}
