'use client';

import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LONGUEUR_ETIQUETTE, nettoyerEtiquette, normaliser } from './outils';

const MAX_ETIQUETTES = 12;

/**
 * Étiquettes d'une note : pastilles retirables et champ d'ajout (Entrée ou
 * virgule), avec suggestions tirées des autres notes.
 */
export function ChampEtiquettes({
  valeur,
  onChange,
  suggestions,
}: Readonly<{
  valeur: string[];
  onChange: (tags: string[]) => void;
  /** Étiquettes déjà utilisées ailleurs, proposées à la saisie. */
  suggestions: string[];
}>) {
  const t = useTranslations();
  const [saisie, setSaisie] = useState('');
  const [focus, setFocus] = useState(false);
  const [actif, setActif] = useState(0);
  const champ = useRef<HTMLInputElement>(null);
  const idListe = useId();

  const presentes = useMemo(() => new Set(valeur.map(normaliser)), [valeur]);
  const proposees = useMemo(() => {
    const f = normaliser(nettoyerEtiquette(saisie));
    return suggestions
      .filter((s) => !presentes.has(normaliser(s)) && (!f || normaliser(s).includes(f)))
      .slice(0, 6);
  }, [suggestions, presentes, saisie]);
  const listeVisible = focus && proposees.length > 0 && saisie.trim().length > 0;

  const ajouter = (brut: string) => {
    const t = nettoyerEtiquette(brut);
    setSaisie('');
    setActif(0);
    if (!t || presentes.has(normaliser(t)) || valeur.length >= MAX_ETIQUETTES) return;
    onChange([...valeur, t]);
  };

  const retirer = (t: string) => {
    onChange(valeur.filter((x) => x !== t));
    champ.current?.focus();
  };

  return (
    <div className="relative flex min-h-8 flex-wrap items-center gap-1.5 py-1">
      {valeur.map((tag) => (
        <span
          key={tag}
          className="group/etiquette inline-flex h-6 items-center gap-0.5 rounded-md border border-border-strong bg-surface-2 pl-1.5 pr-0.5 text-xs text-muted-foreground animate-in fade-in-0 zoom-in-95"
        >
          <span className="text-subtle">#</span>
          <span className="max-w-[160px] truncate text-foreground/85">{tag}</span>
          <button
            type="button"
            onClick={() => retirer(tag)}
            aria-label={t('notes.tags.remove', { tag })}
            className="ml-0.5 flex size-4 items-center justify-center rounded text-subtle transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {valeur.length < MAX_ETIQUETTES && (
        <div className="relative flex min-w-[120px] flex-1 items-center">
          {!saisie && !focus && (
            <Plus
              className="pointer-events-none absolute left-0 size-3.5 text-subtle"
              aria-hidden
            />
          )}
          <input
            ref={champ}
            value={saisie}
            maxLength={LONGUEUR_ETIQUETTE + 1}
            onChange={(e) => {
              const v = e.target.value;
              // Virgule : valide l'étiquette en cours, comme dans la plupart des éditeurs
              if (v.endsWith(',')) ajouter(v.slice(0, -1));
              else {
                setSaisie(v);
                setActif(0);
              }
            }}
            onFocus={() => setFocus(true)}
            onBlur={() => {
              setFocus(false);
              if (saisie.trim()) ajouter(saisie);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                ajouter(listeVisible ? proposees[actif] : saisie);
              } else if (e.key === 'Backspace' && !saisie && valeur.length) {
                onChange(valeur.slice(0, -1));
              } else if (e.key === 'ArrowDown' && listeVisible) {
                e.preventDefault();
                setActif((i) => (i + 1) % proposees.length);
              } else if (e.key === 'ArrowUp' && listeVisible) {
                e.preventDefault();
                setActif((i) => (i - 1 + proposees.length) % proposees.length);
              } else if (e.key === 'Escape') {
                setSaisie('');
                e.currentTarget.blur();
              }
            }}
            placeholder={valeur.length ? t('notes.tags.addPlaceholder') : t('notes.tags.add')}
            aria-label={t('notes.tags.add')}
            role="combobox"
            aria-expanded={listeVisible}
            aria-controls={idListe}
            aria-autocomplete="list"
            className={cn(
              'h-6 w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle focus-visible:outline-none',
              !saisie && !focus && 'pl-5',
            )}
          />
          {listeVisible && (
            <ul
              id={idListe}
              role="listbox"
              className="absolute left-0 top-full z-30 mt-1.5 w-56 overflow-hidden rounded-xl border border-border-strong bg-popover p-1 shadow-elevated animate-in fade-in-0 zoom-in-95"
            >
              {proposees.map((s, i) => (
                <li key={s} role="option" aria-selected={i === actif}>
                  <button
                    type="button"
                    tabIndex={-1}
                    // Avant le blur du champ, sinon la liste disparaît avant le clic
                    onMouseDown={(e) => {
                      e.preventDefault();
                      ajouter(s);
                    }}
                    onMouseEnter={() => setActif(i)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted-foreground',
                      i === actif && 'bg-surface-3 text-foreground',
                    )}
                  >
                    <span className="text-subtle">#</span>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
