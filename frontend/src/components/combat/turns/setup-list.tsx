'use client';

/**
 * Ordre du tour hors combat (docs/combat.md § 12.3) : les personnages de la scène, déjà en
 * place, comme une préparation. Case pour écarter, œil pour cacher aux joueurs (embuscade),
 * « Surpris » ; les autres personnages engagés suivent, décochés. Le démarrage est dans
 * l'en-tête (« Lancer l'initiative », « Démarrer sans initiative »).
 */
import { useTranslations } from 'next-intl';
import { EyeOff, MapPinned, Users, Zap } from 'lucide-react';
import { Illustration } from '@/components/commun/illustration';
import { Notice } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CheckBox } from '../check-box';
import { SIDE_LABELS } from './model';
import { Gauge } from './parts';
import type { SetupChoice, SetupRow } from './setup';
import type { CastMember, ParticipantSheet } from './use-cast';

export function SetupList({
  rows,
  cast,
  sheets,
  loading,
  onMap,
  consulted,
  onChange,
  onConsult,
  onAll,
}: Readonly<{
  rows: readonly SetupRow[];
  cast: ReadonlyMap<string, CastMember>;
  sheets: ReadonlyMap<string, ParticipantSheet>;
  loading: boolean;
  /** Une carte est affichée : la présélection vient de sa scène. */
  onMap: boolean;
  consulted: string | null;
  onChange(row: SetupRow, patch: Partial<SetupChoice>): void;
  onConsult(characterId: string): void;
  onAll(checked: boolean): void;
}>) {
  const t = useTranslations();
  if (loading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );

  if (!rows.length)
    return (
      <Notice
        icon={Users}
        title={t('combat.setup.nobody')}
        description={t('combat.setup.nobodyHint')}
      />
    );

  const checked = rows.filter((r) => r.checked).length;
  const onScene = rows.filter((r) => r.onScene).length;
  const all = allState(checked, rows.length);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5 px-2">
        <CheckBox checked={all} onChange={onAll} label={t('combat.selectAll')} />
        <span className="flex-1 text-[13px] text-muted-foreground">
          {checked} au combat sur {rows.length}
        </span>
        <span className="flex items-center gap-1 text-[11px] text-subtle">
          <MapPinned className="size-3.5" aria-hidden />
          {onMap ? t('combat.setup.onScene', { count: onScene }) : t('combat.setup.noMap')}
        </span>
      </div>
      <ol className="space-y-1" aria-label={t('combat.setup.participants')}>
        {rows.map((r) => {
          const m = cast.get(r.characterId);
          const name = m?.name ?? t('map.common.character');
          const gauge = sheets.get(r.characterId)?.gauge ?? null;
          return (
            <li
              key={r.characterId}
              className={cn(
                'group relative flex items-center gap-2.5 rounded-xl border px-2 py-2 transition-colors',
                consulted === r.characterId
                  ? 'border-info/40 bg-info/5'
                  : 'border-transparent hover:border-border hover:bg-surface',
                !r.checked && 'opacity-60',
              )}
            >
              <button
                type="button"
                onClick={() => onConsult(r.characterId)}
                aria-label={`Consulter ${name}`}
                className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              />
              <CheckBox
                checked={r.checked}
                onChange={(on) => onChange(r, { checked: on })}
                label={t('combat.setup.takesPart', { name })}
                className="relative z-10"
              />
              <Illustration
                largeur={40}
                src={m?.portraitUrl ?? null}
                graine={name}
                position="top"
                className={cn('size-10 shrink-0 rounded-full ring-2 ring-border')}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{name}</span>
                  {r.checked && r.hidden && (
                    <EyeOff
                      className="size-3.5 shrink-0 text-info"
                      aria-label={t('combat.order.hiddenFromPlayers')}
                    />
                  )}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {SIDE_LABELS[r.side].name}
                  {r.onScene ? ` · ${t('combat.onScene')}` : ''}
                </span>
              </span>
              {gauge && <Gauge gauge={gauge} className="hidden xs:flex" />}
              <span className="relative z-10 flex shrink-0 items-center gap-1">
                <Info texte={t('combat.setup.surprisedHint')}>
                  <Button
                    type="button"
                    size="xs"
                    variant={r.surprised ? 'secondary' : 'ghost'}
                    disabled={!r.checked}
                    aria-pressed={r.surprised}
                    onClick={() => onChange(r, { surprised: !r.surprised })}
                    className={cn(r.surprised && 'text-warning')}
                  >
                    <Zap />
                    <span className="sr-only xs:not-sr-only">
                      {t('combat.situation.surprised')}
                    </span>
                  </Button>
                </Info>
                {r.side !== 'players' && (
                  <Info texte={r.hidden ? t('combat.setup.ambush') : t('map.grid.visible')}>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant={r.hidden ? 'secondary' : 'ghost'}
                      disabled={!r.checked}
                      aria-pressed={r.hidden}
                      aria-label={t('combat.setup.hideFrom', { name })}
                      onClick={() => onChange(r, { hidden: !r.hidden })}
                      className={cn(r.hidden && 'text-info')}
                    >
                      <EyeOff />
                    </Button>
                  </Info>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** État d'une case « tout cocher » : toutes, une partie, ou aucune. */
function allState(checked: number, total: number): boolean | 'mixed' {
  if (checked === total) return true;
  return checked ? 'mixed' : false;
}
