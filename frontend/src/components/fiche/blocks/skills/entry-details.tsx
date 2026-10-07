'use client';

/**
 * Corps du détail d'une entrée (carte de compétence, rang de voie, nœud d'arbre) :
 * champs, description assainie et bonus (une ligne par effet, avec son état). Entrée
 * acquise et fiche modifiable : chaque bonus s'active ou se coupe ici comme dans le bloc
 * Bonus (même opération, même état), et « Gérer les bonus » ajoute ou retire les bonus
 * propres.
 */
import { useTranslations } from 'next-intl';
import type { Entree } from '@vtt/rules';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { PossessionDuration } from '@/components/combat/duration-chip';
import { cibleBonusPropres } from '../../bonus-editor/model';
import type { ContexteFiche } from '../../widgets';
import { EntryBonuses, type EntryBonusEdit } from '../effects/entry-bonuses';
import type { SheetWrites } from '../tree/writes';
import { describeEntry } from './model';
import { RichText } from './rich-text';

export function EntryDetails({
  ctx,
  entry,
  writes,
  showDescription = true,
}: Readonly<{
  ctx: ContexteFiche;
  entry: Entree;
  /** Écritures de la fiche (absentes : lecture seule). */
  writes?: SheetWrites;
  showDescription?: boolean;
}>) {
  const t = useTranslations();
  const { fiche } = ctx;
  const d = useMemo(() => describeEntry(fiche, entry), [fiche, entry]);
  // Entrée acquise à activer (capacité à activer…) : ses bonus ne s'appliquent qu'active
  const p = fiche.possessions.get(entry.id);
  const activable = p?.sorte.activable && (!p.sorte.rangs || p.rang > 0) ? p : null;
  const edit = useMemo((): EntryBonusEdit | undefined => {
    if (!writes) return undefined;
    return {
      toggle: writes.toggleEffects,
      own: {
        cible: cibleBonusPropres(fiche, entry.id),
        mj: ctx.mj ?? false,
        set: (effets) => writes.setOwnEffects(entry.id, effets),
      },
    };
  }, [writes, fiche, entry.id, ctx.mj]);
  return (
    <div className="space-y-4">
      {d.fields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.fields.map((f) => (
            <Badge key={f.name} taille="md">
              {f.name} : <span className="text-foreground">{f.value}</span>
            </Badge>
          ))}
        </div>
      )}
      {showDescription && entry.description && (
        <div className="max-h-64 overflow-y-auto pr-1">
          <RichText text={entry.description} />
        </div>
      )}
      {activable && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {activable.actif ? 'Active' : 'Inactive'}
              {activable.actif && <PossessionDuration exemplaires={activable.exemplaires} />}
            </p>
            <p className="text-xs text-subtle">{t('sheet.skills.bonusWhenActive')}</p>
          </div>
          <Switch
            checked={activable.actif}
            disabled={!writes}
            onCheckedChange={(v) => writes?.setActive(entry.id, v)}
            aria-label={`${activable.actif ? t('sheet.effects.disable') : t('sheet.effects.enable')} ${entry.nom}`}
          />
        </div>
      )}
      <EntryBonuses fiche={fiche} entry={entry} edit={edit} />
    </div>
  );
}
