/**
 * Classes des blocs d'entrées et d'arbres. Elles lisent les variables
 * `--fiche-*` posées par le cadre de la fiche ; les transparences passent par
 * color-mix(), Tailwind ne sachant pas appliquer une opacité à var().
 */

export const titleFont = 'font-[family-name:var(--fiche-police-titres)]';

export const text = 'text-[color:var(--fiche-texte)]';
export const textMuted = 'text-[color:var(--fiche-texte-secondaire)]';
export const textAccent = 'text-[color:var(--fiche-accent)]';

export const focus =
  'outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fiche-accent)] focus-visible:ring-offset-0';

/** Cadre d'un bloc de la fiche. */
export const panel =
  'flex flex-col overflow-hidden rounded-2xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)]';

/** Carte d'une entrée (grille). */
export const entryCard = `group relative flex min-h-[3.5rem] cursor-pointer flex-col justify-center rounded-lg border bg-[color:var(--fiche-carte)] p-3 text-left transition-colors ${focus}`;
export const entryCardOn =
  'border-[color:var(--fiche-accent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--fiche-accent)_20%,transparent)]';
export const entryCardOff =
  'border-[color:var(--fiche-bordure)] hover:border-[color:var(--fiche-texte-secondaire)]';

/** Titre en dégradé des dialogues de détail (repris de l'ancienne fiche). */
export const gradientTitle =
  'bg-gradient-to-r from-[color:var(--fiche-accent)] to-[color:var(--fiche-accent-survol)] bg-clip-text text-transparent';

export const iconButton = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)] transition-colors hover:text-[color:var(--fiche-accent)] disabled:cursor-not-allowed disabled:opacity-40 ${focus}`;

/** Bouton principal : dégradé d'accent, texte sombre. */
export const accentButton = `inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[color:var(--fiche-accent)] to-[color:var(--fiche-accent-survol)] px-3 py-1.5 text-sm font-bold text-zinc-950 transition-shadow hover:shadow-lg hover:shadow-[color:color-mix(in_srgb,var(--fiche-accent)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:from-[color:var(--fiche-carte)] disabled:to-[color:var(--fiche-carte)] disabled:text-[color:var(--fiche-texte-secondaire)] [&_svg]:h-3.5 [&_svg]:w-3.5 ${focus}`;

/** Bouton discret (Fermer, Annuler). */
export const ghostButton = `inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[color:var(--fiche-texte-secondaire)] transition-colors hover:bg-white/5 hover:text-[color:var(--fiche-texte)] disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-3.5 [&_svg]:w-3.5 ${focus}`;

/** Bouton d'action destructrice (réinitialiser, retirer). */
export const dangerButton = `inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-red-400/80 transition-colors hover:bg-red-400/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-3.5 [&_svg]:w-3.5 ${focus}`;

/** Bouton d'accent léger (acheter depuis une carte). */
export const softAccentButton = `inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-[color:color-mix(in_srgb,var(--fiche-accent)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,transparent)] px-2 text-[11px] font-semibold text-[color:var(--fiche-accent)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--fiche-accent)_20%,transparent)] disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:h-3 [&_svg]:w-3 ${focus}`;

/** Champ de saisie. */
export const field = `h-9 w-full rounded-lg border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] px-3 text-sm text-[color:var(--fiche-texte)] placeholder:text-[color:var(--fiche-texte-secondaire)] focus-visible:border-[color:var(--fiche-accent)] ${focus}`;

/** Pastille d'accent (marque, solde). */
export const accentChip =
  'inline-flex items-center gap-1 rounded border border-[color:color-mix(in_srgb,var(--fiche-accent)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,transparent)] px-2 py-0.5 text-xs font-semibold text-[color:var(--fiche-accent)]';

/** Solde affiché dans l'en-tête d'un bloc. */
export const balanceBadge =
  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--fiche-bordure)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_12%,transparent)] px-2.5 text-xs font-bold tabular-nums text-[color:var(--fiche-accent)]';

/** Onglet (groupes, catégories). */
export const tab = `h-full shrink-0 rounded-md px-3 text-xs transition-colors ${focus}`;
export const tabOn = 'bg-[color:var(--fiche-accent)] text-zinc-950 font-semibold';
export const tabOff =
  'text-[color:var(--fiche-texte-secondaire)] hover:text-[color:var(--fiche-texte)]';

/** Grille de cartes : colonnes selon la largeur du bloc, pas de l'écran. */
export const autoGrid = 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]';
