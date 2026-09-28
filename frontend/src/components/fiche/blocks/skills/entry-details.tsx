'use client';

/**
 * Corps du détail d'une entrée (carte de compétence, rang de voie, nœud d'arbre) :
 * champs, description assainie et bonus (une ligne par effet, avec son état). Entrée
 * acquise et fiche modifiable : chaque bonus s'active ou se coupe ici comme dans le bloc
 * Bonus (même opération, même état), et « Gérer les bonus » ajoute ou retire les bonus
 * propres.
 */
import type { Entree } from '@vtt/rules';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
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
}: {
  ctx: ContexteFiche;
  entry: Entree;
  /** Écritures de la fiche (absentes : lecture seule). */
  writes?: SheetWrites | undefined;
  showDescription?: boolean;
}) {
  const { fiche } = ctx;
  const d = useMemo(() => describeEntry(fiche, entry), [fiche, entry]);
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
      <EntryBonuses fiche={fiche} entry={entry} edit={edit} />
    </div>
  );
}
