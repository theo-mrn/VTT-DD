'use client';

/**
 * « Trajets » dans la barre d'outils (docs/carte.md § 10, Trajet des déplacements) : la bascule
 * de chacun (⇧T) et, à côté pour le MJ, la règle de la table. Quand le MJ l'impose ou la coupe,
 * le bouton d'un joueur est grisé et dit pourquoi en infobulle.
 */
import { Check, ChevronUp, Route } from 'lucide-react';
import { useState } from 'react';
import { useStore } from 'zustand';
import { useMapState } from '@/components/map/engine-context';
import { focusMap, ToolbarButton } from '@/components/map/toolbar/kit';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { mapActionShortcutOf } from '@/lib/map/shortcuts';
import { useBindingLabel } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { TOGGLE_ACTION_ID } from '../engine/register';
import {
  pathPrefs,
  ruleForced,
  setPathsShown,
  setTableRule,
  TABLE_RULES,
  tableRule,
  type TableRule,
} from '../engine/rule';

export function PathControls({ engine }: Readonly<{ engine: MapEngine }>) {
  const gm = engine.viewer.role === 'gm';
  const pref = useStore(pathPrefs(engine), (s) => s.shown);
  const rule = tableRule(useMapState((s) => s.scene));
  const touche = useBindingLabel(mapActionShortcutOf(TOGGLE_ACTION_ID));

  if (ruleForced(engine, rule)) {
    const label = rule === 'shown' ? 'Trajets affichés par le MJ' : 'Trajets masqués par le MJ';
    return (
      <Info texte={label}>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={rule === 'shown'}
            disabled
            className={cn(rule === 'shown' && 'text-primary')}
          >
            <Route />
          </Button>
        </span>
      </Info>
    );
  }

  return (
    <div className="flex items-center">
      <ToolbarButton
        label={pref ? 'Masquer les trajets' : 'Afficher les trajets'}
        shortcut={touche.label ?? undefined}
        active={pref}
        onClick={() => {
          setPathsShown(engine, !pref);
          focusMap(engine);
        }}
      >
        <Route />
      </ToolbarButton>
      {gm && <TableRuleMenu engine={engine} rule={rule} />}
    </div>
  );
}

/** Règle de la table (MJ) : au choix de chacun, toujours affichés, masqués. */
function TableRuleMenu({ engine, rule }: Readonly<{ engine: MapEngine; rule: TableRule }>) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte="Trajets pour la table">
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Trajets pour la table"
            className={cn('w-5 px-0 text-muted-foreground', rule !== 'free' && 'text-primary')}
          >
            <ChevronUp />
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent side="top" className="w-56 p-2">
        <p className="px-2 pb-1 pt-1 text-sm font-semibold">Trajets pour la table</p>
        <div role="radiogroup" aria-label="Trajets pour la table" className="space-y-0.5">
          {TABLE_RULES.map((r) => {
            const on = r.value === rule;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  void setTableRule(engine, r.value);
                  setOpen(false);
                  focusMap(engine);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium transition-colors',
                  'hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  on && 'text-primary',
                )}
              >
                <Check className={cn('size-3.5 shrink-0', !on && 'invisible')} aria-hidden />
                {r.label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
