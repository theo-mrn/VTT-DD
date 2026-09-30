'use client';

/**
 * Étape « Action » du menu d'attaque (docs/combat.md § 12.1, 1), reprise des grandes cartes de
 * l'ancienne page : une carte par action à cible (icône, nom, jet ou pool en pastille, courte
 * description), groupées comme la présentation du système le déclare. Touches 1 à 9 : une
 * carte ; Entrée : la carte mise en avant (la dernière jouée par ce personnage).
 */
import type { Action, Fiche, Presentation, SystemeCharge } from '@vtt/rules';
import { ArrowRight, History, Sword, Target, Wand } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ComponentType } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { previewRoll, type ActionGroup, type RollPreview } from '@/lib/combat/actions';
import { attackerParams, mergeParams } from '@/lib/combat/params';
import { cn } from '@/lib/utils';
import { PreviewText } from './preview';

/**
 * Icône d'une action, déduite de sa forme (jamais de son identifiant) : une arme en
 * paramètre, un jet contre la cible, sinon un effet direct (soin, sort sans jet de toucher).
 */
function actionIcon(
  systeme: SystemeCharge,
  action: Action,
  fiche: Fiche,
): ComponentType<{ className?: string }> {
  const weapon = attackerParams(systeme, action, fiche).some((p) => {
    if (p.type !== 'entree') return false;
    const sorte = systeme.sortes.get(p.sorte);
    return Boolean(sorte?.champs.some((c) => c.type === 'formule' && c.des));
  });
  if (weapon) return Sword;
  return action.jet.reussite ? Target : Wand;
}

export function StepAction({
  systeme,
  presentation,
  fiche,
  groups,
  selected,
  rememberedId,
  onChoose,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  groups: readonly ActionGroup[];
  /** Action mise en avant (présélection) : Entrée la choisit. */
  selected: string | null;
  rememberedId: string | null;
  onChoose: (a: Action) => void;
}) {
  const reduced = useReducedMotion();
  if (!groups.length)
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border-strong px-6 py-10 text-center">
        <Target className="mx-auto mb-3 size-8 text-subtle" aria-hidden />
        <p className="font-medium">Aucune action contre une cible</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Ce personnage n’a aucune attaque, aucun sort ni aucun soin à jouer contre une cible.
        </p>
      </div>
    );
  let index = 0;
  return (
    <div className="space-y-7">
      {groups.map((g) => (
        <section key={g.id} aria-label={g.title ?? 'Actions'}>
          {g.title && (
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
              {g.title}
            </h3>
          )}
          <div className="grid gap-3 xs:grid-cols-2 lg:grid-cols-3">
            {g.actions.map((a) => {
              const i = index++;
              const params = mergeParams(systeme, a, fiche);
              return (
                <motion.div
                  key={a.id}
                  initial={reduced ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: reduced ? 0 : Math.min(i, 9) * 0.035 }}
                >
                  <ActionCard
                    action={a}
                    icon={actionIcon(systeme, a, fiche)}
                    preview={previewRoll(systeme, a, fiche, params)}
                    presentation={presentation}
                    shortcut={i < 9 ? i + 1 : null}
                    highlighted={a.id === selected}
                    remembered={a.id === rememberedId}
                    onChoose={() => onChoose(a)}
                  />
                </motion.div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ActionCard({
  action,
  icon: Icon,
  preview,
  presentation,
  shortcut,
  highlighted,
  remembered,
  onChoose,
}: {
  action: Action;
  icon: ComponentType<{ className?: string }>;
  preview: RollPreview | null;
  presentation: Presentation | null;
  shortcut: number | null;
  highlighted: boolean;
  remembered: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      aria-keyshortcuts={shortcut ? String(shortcut) : undefined}
      className={cn(
        'group relative isolate flex h-full min-h-[9.5rem] w-full flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-[transform,border-color,background-color,box-shadow] duration-200 sm:min-h-[11rem] sm:p-5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        'hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-glow motion-reduce:hover:translate-y-0',
        highlighted
          ? 'border-primary/55 bg-primary/[0.07] shadow-glow'
          : 'border-border bg-card shadow-surface',
      )}
    >
      {/* Filigrane de l'icône, comme sur l'ancienne page */}
      <Icon
        className="pointer-events-none absolute -bottom-6 -right-6 -z-10 size-32 rotate-12 text-foreground/[0.035] transition-transform duration-500 group-hover:rotate-0 group-hover:scale-110 motion-reduce:transition-none"
        aria-hidden
      />
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl border transition-colors',
            highlighted
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border-strong bg-surface-2 text-muted-foreground group-hover:text-primary',
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1.05rem] font-semibold leading-snug">
            {action.nom}
          </span>
          {remembered && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
              <History className="size-3" aria-hidden /> Dernière jouée
            </span>
          )}
        </span>
        {shortcut && (
          <Kbd aria-hidden className="shrink-0 max-sm:hidden">
            {shortcut}
          </Kbd>
        )}
      </div>
      {action.description && (
        <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
          {action.description}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {preview ? (
          <span className="inline-flex max-w-[85%] items-center gap-1.5 truncate rounded-full border border-border-strong bg-surface-2/80 px-2.5 py-1 text-[12px]">
            <PreviewText preview={preview} presentation={presentation} compact />
          </span>
        ) : (
          <span />
        )}
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 text-subtle transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
        >
          <ArrowRight className="size-3.5" />
        </span>
      </div>
    </button>
  );
}
