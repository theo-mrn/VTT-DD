/**
 * Classes partagées par les blocs de la fiche. Elles lisent les variables
 * `--fiche-*` posées par le cadre (voir theme.ts) ; les transparences passent
 * par color-mix(), Tailwind ne sachant pas appliquer une opacité à var().
 */

export const titleFont = 'font-[family-name:var(--fiche-police-titres)]';

export const text = 'text-[color:var(--fiche-texte)]';
export const textMuted = 'text-[color:var(--fiche-texte-secondaire)]';
export const textAccent = 'text-[color:var(--fiche-accent)]';

export const border = 'border-[color:var(--fiche-bordure)]';

/** Carte d'un bloc de la fiche. */
export const card =
  'rounded-2xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] p-4 sm:p-5';

/** Case d'une valeur (attribut, ressource…). */
export const valueBox =
  'rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)]';

export const accentBgSoft = 'bg-[color:color-mix(in_srgb,var(--fiche-accent)_14%,transparent)]';
export const accentBorder = 'border-[color:color-mix(in_srgb,var(--fiche-accent)_55%,transparent)]';

/** Anneau de focus visible, aux couleurs de la fiche. */
export const focus =
  'outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fiche-accent)] focus-visible:ring-offset-0';

/** Petit bouton carré (+, −, actions de ligne). */
export const iconButton = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte)] transition-colors hover:border-[color:var(--fiche-accent)] hover:text-[color:var(--fiche-accent)] disabled:cursor-not-allowed disabled:opacity-40 ${focus}`;

/** Bouton d'action principal, aux couleurs de la fiche. */
export const accentButton = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--fiche-accent)] px-3 py-1.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-[color:var(--fiche-accent-survol)] disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4 ${focus}`;

/** Bouton secondaire, aux couleurs de la fiche. */
export const secondaryButton = `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--fiche-bordure)] px-3 py-1.5 text-sm text-[color:var(--fiche-texte)] transition-colors hover:border-[color:var(--fiche-accent)] disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-4 [&_svg]:w-4 ${focus}`;

/** Champ de saisie, aux couleurs de la fiche. */
export const field = `h-9 w-full rounded-lg border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] px-3 text-sm text-[color:var(--fiche-texte)] placeholder:text-[color:var(--fiche-texte-secondaire)] focus-visible:border-[color:var(--fiche-accent)] ${focus}`;

/** Pastille (marque, étiquette, statut). */
export const chip =
  'inline-flex items-center gap-1 rounded-full border border-[color:var(--fiche-bordure)] px-2 py-0.5 text-[11px] leading-none text-[color:var(--fiche-texte-secondaire)]';

/** Nombre de colonnes (classes littérales, pour que Tailwind les génère). */
export const COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-3 sm:grid-cols-5',
  6: 'grid-cols-3 sm:grid-cols-6',
};
