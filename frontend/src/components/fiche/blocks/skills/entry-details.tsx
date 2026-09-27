'use client';

/**
 * Corps du détail d'une entrée (carte de compétence, rang de voie, nœud d'arbre) :
 * champs, description assainie et bonus (une ligne par effet, avec son état). Les bonus
 * s'activent ou se coupent dans le bloc Bonus, pas ici.
 */
import type { Entree, Fiche } from '@vtt/rules';
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { EntryBonuses } from '../effects/entry-bonuses';
import { describeEntry } from './model';
import { RichText } from './rich-text';

export function EntryDetails({
  fiche,
  entry,
  showDescription = true,
  onManageBonus,
}: {
  fiche: Fiche;
  entry: Entree;
  showDescription?: boolean;
  /** Amène le bloc Bonus à l'écran (absent : pas de lien). */
  onManageBonus?: (() => void) | undefined;
}) {
  const d = useMemo(() => describeEntry(fiche, entry), [fiche, entry]);
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
      <EntryBonuses fiche={fiche} entry={entry} onManage={onManageBonus} />
    </div>
  );
}
