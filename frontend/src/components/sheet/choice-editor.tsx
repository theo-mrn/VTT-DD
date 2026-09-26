'use client';

/**
 * Choix d'une entrée (« 4 compétences de carrière », « +1 à une
 * caractéristique au choix ») : options et nombre à retenir lus sur la fiche,
 * par les fonctions du moteur. Partagé par la fiche et l'assistant de création.
 */
import {
  chemins,
  ErreurEvaluation,
  essayer,
  nombreChoix,
  optionsChoix,
  type Attribut,
  type Entree,
  type Fiche,
  type Valeur,
} from '@vtt/rules';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { focus, text, textAccent, textMuted } from './styles';

export type Choice = Record<string, string[]>;

/** Nombre d'attributs à retenir pour un choix d'attributs (variable `rang` : rang de l'entrée). */
export function attributeChoiceCount(sheet: Fiche, entry: Entree, choiceId: string): number {
  const f = sheet.systeme.formules.get(chemins.choixAttributNombre(entry.id, choiceId));
  if (!f) return 0;
  const p = sheet.possessions.get(entry.id);
  const vars: Record<string, Valeur> = { rang: p?.rang ?? 0, actif: p?.actif ?? true };
  const r = essayer(sheet, f, {
    variable: (name) => {
      if (name in vars) return vars[name]!;
      if (name.startsWith('source.')) {
        const v = p?.possession?.champs[name.slice(7)] ?? entry.champs[name.slice(7)];
        if (v !== undefined && !Array.isArray(v)) return v;
      }
      throw new ErreurEvaluation(`Variable absente : ${name}`, 0);
    },
  });
  const n = r.ok ? Number(r.valeur) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** L'entrée demande-t-elle des choix ? */
export const hasChoices = (e: Entree) => e.choix.length > 0 || e.choixAttributs.length > 0;

/** Choix incomplets (moins d'options retenues que le nombre demandé). */
export function incompleteChoices(sheet: Fiche, entry: Entree, value: Choice): string[] {
  const r: string[] = [];
  for (const c of entry.choix) {
    const n = nombreChoix(sheet, entry.id, c);
    if ((value[c.id]?.length ?? 0) < n) r.push(c.nom);
  }
  for (const c of entry.choixAttributs) {
    const n = attributeChoiceCount(sheet, entry, c.id);
    if ((value[c.id]?.length ?? 0) < n) r.push(c.nom);
  }
  return r;
}

export function ChoiceEditor({
  sheet,
  entry,
  value,
  onChange,
  disabled,
}: {
  sheet: Fiche;
  entry: Entree;
  value: Choice;
  onChange(v: Choice): void;
  disabled?: boolean;
}) {
  const attributes = sheet.entite.attributs;

  const toggle = (choices: string, id: string, max: number) => {
    const currentOnes = value[choices] ?? [];
    const next = currentOnes.includes(id)
      ? currentOnes.filter((x) => x !== id)
      : max === 1
        ? [id]
        : currentOnes.length < max
          ? [...currentOnes, id]
          : currentOnes;
    onChange({ ...value, [choices]: next });
  };

  return (
    <div className="space-y-4">
      {entry.choix.map((c) => {
        const count = nombreChoix(sheet, entry.id, c);
        const keptIds = value[c.id] ?? [];
        const options = optionsChoix(sheet, c);
        // Les options déjà retenues restent visibles, même si une marque les exclut désormais
        for (const id of keptIds) {
          const e = sheet.systeme.entrees.get(id);
          if (e && !options.some((o) => o.id === id)) options.push(e);
        }
        options.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
        return (
          <OptionGroup
            key={c.id}
            title={c.nom}
            count={count}
            keptCount={keptIds.length}
            options={options.map((o) => ({ id: o.id, name: o.nom, description: o.description }))}
            isKept={(id) => keptIds.includes(id)}
            onToggle={(id) => toggle(c.id, id, count)}
            disabled={disabled}
          />
        );
      })}
      {entry.choixAttributs.map((c) => {
        const count = attributeChoiceCount(sheet, entry, c.id);
        const keptIds = value[c.id] ?? [];
        const options: Attribut[] = [];
        for (const a of attributes.values()) {
          const offered =
            c.parmi.attributs?.includes(a.cle) ||
            (c.parmi.groupe !== undefined && a.groupe === c.parmi.groupe);
          if (offered) options.push(a);
        }
        return (
          <OptionGroup
            key={c.id}
            title={c.nom}
            count={count}
            keptCount={keptIds.length}
            options={options.map((a) => ({ id: a.cle, name: a.nom, description: a.description }))}
            isKept={(id) => keptIds.includes(id)}
            onToggle={(id) => toggle(c.id, id, count)}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}

function OptionGroup({
  title,
  count,
  keptCount,
  options,
  isKept,
  onToggle,
  disabled,
}: {
  title: string;
  count: number;
  keptCount: number;
  options: { id: string; name: string; description?: string }[];
  isKept(id: string): boolean;
  onToggle(id: string): void;
  disabled?: boolean;
}) {
  const complete = keptCount >= count;
  return (
    <fieldset className="space-y-2">
      <legend
        className={cn(text, 'flex w-full items-baseline justify-between gap-2 text-sm font-medium')}
      >
        <span>{title}</span>
        <span className={cn('text-xs tabular-nums', complete ? textAccent : textMuted)}>
          {keptCount} / {count}
        </span>
      </legend>
      {options.length ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {options.map((o) => {
            const kept = isKept(o.id);
            const blocked = disabled || (!kept && complete && count !== 1);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={kept}
                  disabled={blocked}
                  onClick={() => onToggle(o.id)}
                  title={o.description}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    kept
                      ? 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_14%,transparent)] text-[color:var(--fiche-texte)]'
                      : 'border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)] hover:border-[color:var(--fiche-accent)]',
                    focus,
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      kept
                        ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)] text-zinc-950'
                        : 'border-[color:var(--fiche-bordure)]',
                    )}
                  >
                    {kept && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 truncate">{o.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn(textMuted, 'text-xs')}>Aucune option disponible pour l&apos;instant.</p>
      )}
    </fieldset>
  );
}
