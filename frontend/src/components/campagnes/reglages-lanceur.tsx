'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Interrupteur } from '@/components/compte/elements';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  groupRollable,
  systemRollableAttributes,
  type RollableAttribute,
} from '@/lib/rollable-attributes';
import { useSysteme } from '@/lib/systemes';

/**
 * Attributs proposés dans le lanceur de dés de toute la table : ceux que les règles du
 * système déclarent jetables, groupés comme dans le lanceur. Le MJ ne peut qu'en retirer.
 */
export function ReglagesLanceur({
  systemId,
  hidden,
  onChange,
  loading,
}: Readonly<{
  systemId: string;
  /** Clés retirées du lanceur. */
  hidden: readonly string[];
  onChange: (hidden: string[]) => void;
  loading?: boolean;
}>) {
  const t = useTranslations('campaigns.settings.launcher');
  const systeme = useSysteme(systemId);
  const groups = useMemo(
    () =>
      systeme.data
        ? groupRollable(systemRollableAttributes(systeme.data.systeme, systeme.data.presentation))
        : [],
    [systeme.data],
  );
  const retires = new Set(hidden);
  const basculer = (key: string, visible: boolean) =>
    onChange(visible ? hidden.filter((k) => k !== key) : [...hidden, key]);

  let etat: 'chargement' | 'erreur' | 'aucun' | 'liste' = 'liste';
  if (systeme.isPending || loading) etat = 'chargement';
  else if (systeme.error) etat = 'erreur';
  else if (!groups.length) etat = 'aucun';

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>{t('title')}</Label>
        <p className="text-xs text-subtle">{t('lead')}</p>
      </div>
      {etat === 'chargement' && (
        <div className="space-y-2" aria-label={t('loading')}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      )}
      {etat === 'erreur' && systeme.error && (
        <p className="text-xs text-destructive">
          {t('systemUnavailable', { error: systeme.error.message })}
        </p>
      )}
      {etat === 'aucun' && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-subtle">
          {t('none')}
        </p>
      )}
      {etat === 'liste' && (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.id ?? ''} className="space-y-2.5">
              {g.title && (
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                  {g.title}
                </h4>
              )}
              {g.attributes.map((a) => (
                <Interrupteur
                  key={a.key}
                  actif={!retires.has(a.key)}
                  onChange={(v) => basculer(a.key, v)}
                  label={
                    <>
                      {a.name}
                      {a.label !== a.name && (
                        <span className="ml-1.5 font-mono text-xs text-subtle">{a.label}</span>
                      )}
                      {a.gmOnly && (
                        <span className="ml-1.5 text-xs text-subtle">{t('gmOnly')}</span>
                      )}
                    </>
                  }
                  description={
                    <>
                      {t(`adds.${a.kind}`)} <code className="font-mono">{a.term}</code>
                    </>
                  }
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
