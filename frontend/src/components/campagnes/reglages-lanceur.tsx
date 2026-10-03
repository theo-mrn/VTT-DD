'use client';

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

const APPORT: Record<RollableAttribute['kind'], string> = {
  modificateur: 'Ajoute son modificateur',
  valeur: 'Ajoute sa valeur',
  formule: 'Ajoute',
};

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

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Lanceur de dés</Label>
        <p className="text-xs text-subtle">
          Attributs proposés en raccourci dans le lanceur de toute la table. Retirez ceux dont vous
          ne voulez pas.
        </p>
      </div>
      {systeme.isPending || loading ? (
        <div className="space-y-2" aria-label="Chargement des attributs">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      ) : systeme.error ? (
        <p className="text-xs text-destructive">Système indisponible : {systeme.error.message}</p>
      ) : !groups.length ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-subtle">
          Ce système ne propose aucun attribut au lanceur : ses jets passent par les actions de la
          fiche.
        </p>
      ) : (
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
                      {a.gmOnly && <span className="ml-1.5 text-xs text-subtle">(MJ)</span>}
                    </>
                  }
                  description={
                    <>
                      {APPORT[a.kind]} <code className="font-mono">{a.term}</code>
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
