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
import { focus, texte, texteAccent, texteSecondaire } from './styles';

export type Choix = Record<string, string[]>;

/** Nombre d'attributs à retenir pour un choix d'attributs (variable `rang` : rang de l'entrée). */
export function nombreChoixAttributs(fiche: Fiche, entree: Entree, choixId: string): number {
  const f = fiche.systeme.formules.get(chemins.choixAttributNombre(entree.id, choixId));
  if (!f) return 0;
  const p = fiche.possessions.get(entree.id);
  const vars: Record<string, Valeur> = { rang: p?.rang ?? 0, actif: p?.actif ?? true };
  const r = essayer(fiche, f, {
    variable: (nom) => {
      if (nom in vars) return vars[nom]!;
      if (nom.startsWith('source.')) {
        const v = p?.possession?.champs[nom.slice(7)] ?? entree.champs[nom.slice(7)];
        if (v !== undefined && !Array.isArray(v)) return v;
      }
      throw new ErreurEvaluation(`Variable absente : ${nom}`, 0);
    },
  });
  const n = r.ok ? Number(r.valeur) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** L'entrée demande-t-elle des choix ? */
export const aDesChoix = (e: Entree) => e.choix.length > 0 || e.choixAttributs.length > 0;

/** Choix incomplets (moins d'options retenues que le nombre demandé). */
export function choixIncomplets(fiche: Fiche, entree: Entree, valeur: Choix): string[] {
  const r: string[] = [];
  for (const c of entree.choix) {
    const n = nombreChoix(fiche, entree.id, c);
    if ((valeur[c.id]?.length ?? 0) < n) r.push(c.nom);
  }
  for (const c of entree.choixAttributs) {
    const n = nombreChoixAttributs(fiche, entree, c.id);
    if ((valeur[c.id]?.length ?? 0) < n) r.push(c.nom);
  }
  return r;
}

export function EditeurChoix({
  fiche,
  entree,
  valeur,
  onChange,
  desactive,
}: {
  fiche: Fiche;
  entree: Entree;
  valeur: Choix;
  onChange(v: Choix): void;
  desactive?: boolean;
}) {
  const attributs = fiche.entite.attributs;

  const basculer = (choix: string, id: string, max: number) => {
    const actuels = valeur[choix] ?? [];
    const suivant = actuels.includes(id)
      ? actuels.filter((x) => x !== id)
      : max === 1
        ? [id]
        : actuels.length < max
          ? [...actuels, id]
          : actuels;
    onChange({ ...valeur, [choix]: suivant });
  };

  return (
    <div className="space-y-4">
      {entree.choix.map((c) => {
        const nombre = nombreChoix(fiche, entree.id, c);
        const retenus = valeur[c.id] ?? [];
        const options = optionsChoix(fiche, c);
        // Les options déjà retenues restent visibles, même si une marque les exclut désormais
        for (const id of retenus) {
          const e = fiche.systeme.entrees.get(id);
          if (e && !options.some((o) => o.id === id)) options.push(e);
        }
        options.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
        return (
          <GroupeOptions
            key={c.id}
            titre={c.nom}
            nombre={nombre}
            retenus={retenus.length}
            options={options.map((o) => ({ id: o.id, nom: o.nom, description: o.description }))}
            estRetenu={(id) => retenus.includes(id)}
            onBasculer={(id) => basculer(c.id, id, nombre)}
            desactive={desactive}
          />
        );
      })}
      {entree.choixAttributs.map((c) => {
        const nombre = nombreChoixAttributs(fiche, entree, c.id);
        const retenus = valeur[c.id] ?? [];
        const options: Attribut[] = [];
        for (const a of attributs.values()) {
          const propose =
            c.parmi.attributs?.includes(a.cle) ||
            (c.parmi.groupe !== undefined && a.groupe === c.parmi.groupe);
          if (propose) options.push(a);
        }
        return (
          <GroupeOptions
            key={c.id}
            titre={c.nom}
            nombre={nombre}
            retenus={retenus.length}
            options={options.map((a) => ({ id: a.cle, nom: a.nom, description: a.description }))}
            estRetenu={(id) => retenus.includes(id)}
            onBasculer={(id) => basculer(c.id, id, nombre)}
            desactive={desactive}
          />
        );
      })}
    </div>
  );
}

function GroupeOptions({
  titre,
  nombre,
  retenus,
  options,
  estRetenu,
  onBasculer,
  desactive,
}: {
  titre: string;
  nombre: number;
  retenus: number;
  options: { id: string; nom: string; description?: string }[];
  estRetenu(id: string): boolean;
  onBasculer(id: string): void;
  desactive?: boolean;
}) {
  const complet = retenus >= nombre;
  return (
    <fieldset className="space-y-2">
      <legend
        className={cn(
          texte,
          'flex w-full items-baseline justify-between gap-2 text-sm font-medium',
        )}
      >
        <span>{titre}</span>
        <span className={cn('text-xs tabular-nums', complet ? texteAccent : texteSecondaire)}>
          {retenus} / {nombre}
        </span>
      </legend>
      {options.length ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {options.map((o) => {
            const retenu = estRetenu(o.id);
            const bloque = desactive || (!retenu && complet && nombre !== 1);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={retenu}
                  disabled={bloque}
                  onClick={() => onBasculer(o.id)}
                  title={o.description}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    retenu
                      ? 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_14%,transparent)] text-[color:var(--fiche-texte)]'
                      : 'border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)] hover:border-[color:var(--fiche-accent)]',
                    focus,
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      retenu
                        ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)] text-zinc-950'
                        : 'border-[color:var(--fiche-bordure)]',
                    )}
                  >
                    {retenu && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 truncate">{o.nom}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn(texteSecondaire, 'text-xs')}>
          Aucune option disponible pour l&apos;instant.
        </p>
      )}
    </fieldset>
  );
}
