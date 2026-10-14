'use client';

import { useTranslations } from 'next-intl';
import {
  Activity,
  CloudMoon,
  HeartPulse,
  Moon,
  Snowflake,
  TriangleAlert,
  Vibrate,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { usePersonnagesCampagne } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { useTableOptionnelle } from '../../../contexte';
import { triggerOneShot } from '../send';
import { mood, MOODS, ONE_SHOTS, personalMoods, type Mood, type OneShot } from '../state';

export const ONE_SHOT_ICON: Record<OneShot, LucideIcon> = {
  shake: Vibrate,
  quake: Activity,
  flash: Zap,
  heartbeat: HeartPulse,
};

export const MOOD_ICON: Record<Mood, LucideIcon> = {
  dark: Moon,
  danger: TriangleAlert,
  cold: Snowflake,
  dream: CloudMoon,
};

/** Une ambiance d'écran en cours, de la table ou d'un personnage (bouton Météo allumé). */
export const useScreenMood = () => {
  const table = useStore(mood.store, (s) => s.value);
  const perso = useStore(personalMoods.store, (s) => s.value);
  return table ?? (perso && Object.values(perso)[0]) ?? null;
};

export interface CharacterTarget {
  id: string;
  name: string;
  portrait: string | null;
  /** Joueur qui le joue (celui qui l'incarne, sinon son propriétaire) : il reçoit l'effet. */
  userId: string;
}

/** Personnages joueurs de la campagne qu'on peut viser (ceux d'un joueur, pas du MJ). */
export function useCharacterTargets(): CharacterTarget[] {
  const table = useTableOptionnelle();
  const persos = usePersonnagesCampagne(table?.campagne.id);
  return useMemo(() => {
    const gms = new Set(
      (table?.campagne.members ?? []).filter((m) => m.role === 'gm').map((m) => m.userId),
    );
    return (persos.data ?? []).flatMap((p) => {
      const e = table?.campagne.characters.find((c) => c.characterId === p.id);
      const userId = e?.playedBy ?? e?.ownerId;
      return userId && !gms.has(userId)
        ? [{ id: p.id, name: p.name, portrait: p.portraitUrl, userId }]
        : [];
    });
  }, [persos.data, table?.campagne.characters, table?.campagne.members]);
}

/** Grande tuile du menu Météo : icône, nom ; pleine quand choisie. */
export function AmbienceTile({
  icon: Icon,
  label,
  on,
  onClick,
  role = 'radio',
}: Readonly<{
  icon: LucideIcon;
  label: string;
  on?: boolean;
  onClick(): void;
  role?: 'radio' | 'button';
}>) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'radio' ? !!on : undefined}
      onClick={onClick}
      className={cn(
        'group flex h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-center text-[11px] font-medium leading-tight transition-[background-color,color,box-shadow,transform]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        role === 'button' && 'active:scale-95',
        on
          ? 'bg-primary/15 text-primary ring-[1.5px] ring-inset ring-primary/70'
          : 'bg-surface-2/60 text-muted-foreground hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <Icon
        className={cn(
          'size-5 transition-transform group-hover:scale-110',
          role === 'button' && !on && 'text-primary',
        )}
        aria-hidden
      />
      <span className="w-full truncate">{label}</span>
    </button>
  );
}

export function AmbienceSection({
  title,
  aside,
  children,
}: Readonly<{ title: string; aside?: ReactNode; children: ReactNode }>) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle">
          {title}
        </h4>
        <span className="h-px flex-1 bg-border/70" aria-hidden />
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Valeur commune à plusieurs personnages (la tuile s'allume si tous l'ont) ; `undefined` s'ils
 * diffèrent.
 */
export function commonValue<T>(values: readonly T[]): T | undefined {
  return values.length && values.every((v) => v === values[0]) ? values[0] : undefined;
}

/**
 * Ambiances d'écran (une à la fois) de la table, ou de personnages (`userIds` de leurs
 * joueurs ; vide : la table).
 */
export function MoodGrid({ userIds }: Readonly<{ userIds: readonly string[] }>) {
  const t = useTranslations('table.screenFx');
  const globale = useStore(mood.store, (s) => s.value);
  const perso = useStore(personalMoods.store, (s) => s.value) ?? {};
  const actuelle = userIds.length ? commonValue(userIds.map((u) => perso[u] ?? null)) : globale;
  const choisir = (m: Mood | null) => {
    if (!userIds.length) return mood.set(m);
    const next = { ...perso };
    for (const u of userIds)
      if (m) next[u] = m;
      else delete next[u];
    personalMoods.set(next);
  };
  return (
    <AmbienceSection title={t('moodsTitle')}>
      <div role="radiogroup" aria-label={t('moodsTitle')} className="grid grid-cols-4 gap-1.5">
        {MOODS.map((m) => (
          <AmbienceTile
            key={m}
            icon={MOOD_ICON[m]}
            label={t(`moods.${m}`)}
            on={actuelle === m}
            onClick={() => choisir(actuelle === m ? null : m)}
          />
        ))}
      </div>
    </AmbienceSection>
  );
}

/** Effets d'un clic, chez toute la table ou chez les joueurs de ces personnages. */
export function EffectGrid({ userIds }: Readonly<{ userIds: readonly string[] }>) {
  const t = useTranslations('table.screenFx');
  return (
    <AmbienceSection title={t('oneShotsTitle')}>
      <div className="grid grid-cols-4 gap-1.5">
        {ONE_SHOTS.map((fx) => (
          <AmbienceTile
            key={fx}
            role="button"
            icon={ONE_SHOT_ICON[fx]}
            label={t(`effects.${fx}`)}
            onClick={() => triggerOneShot(fx, userIds.length ? userIds : undefined)}
          />
        ))}
      </div>
    </AmbienceSection>
  );
}
