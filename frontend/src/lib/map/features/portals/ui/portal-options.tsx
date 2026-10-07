'use client';

/**
 * Barre contextuelle de l'outil portails (X) : réglages des portails posés (icône, couleur,
 * rayon, aller-retour, automatique, visible des joueurs), gardés dans le navigateur, et rappel
 * des gestes selon l'étape (entrée, arrivée, choix d'une arrivée).
 */
import { translate } from '@/i18n/runtime';
import { ArrowRightLeft, Eye, EyeOff, Palette, Zap } from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { iconLabel, PORTAL_ICONS, portalColorOptions, RADIUS_RANGE } from '../engine/model';
import { PortalTool } from '../engine/tool';
import {
  OptionButton,
  OptionSeparator,
  RangeField,
  Swatches,
} from '@/lib/map/features/obstacles/ui/controls';
import { PortalGlyph } from './portal-glyph';

export function PortalOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = engine.tools.active;
  if (!(tool instanceof PortalTool)) return null;
  return <Options engine={engine} tool={tool} />;
}

function Options({ engine, tool }: Readonly<{ engine: MapEngine; tool: PortalTool }>) {
  const s = useStore(tool.settings);
  const state = useStore(tool.ui, (u) => u.state);
  const set = tool.settings.setState;
  const unit = engine.kindContext().unitName;
  const hint = translate(
    `map.portals.hints.${state === 'destination' || state === 'pick' ? state : 'idle'}`,
  );

  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        <span className="px-1 text-xs text-muted-foreground">{translate('map.portals.new')}</span>
        {PORTAL_ICONS.map((i) => (
          <OptionButton
            key={i}
            label={iconLabel(i)}
            active={s.icon === i}
            onClick={() => set({ icon: i })}
          >
            <PortalGlyph icon={i} />
          </OptionButton>
        ))}
        <OptionSeparator />
        <Popover>
          <Info texte={translate('map.portals.colorZone')}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 px-2"
                aria-label={translate('map.portals.colorZone')}
              >
                <span
                  aria-hidden
                  className="size-4 rounded-full border border-border-strong"
                  style={{ backgroundColor: s.color }}
                />
                <Palette />
              </Button>
            </PopoverTrigger>
          </Info>
          <PopoverContent side="top" className="w-72 space-y-4 p-3">
            <Swatches
              value={s.color}
              options={portalColorOptions()}
              onChange={(c) => c && set({ color: c })}
            />
            <RangeField
              label="Zone (rayon)"
              value={s.radius}
              min={RADIUS_RANGE.min}
              max={RADIUS_RANGE.max}
              step={RADIUS_RANGE.step}
              format={(v) => `${v.toLocaleString('fr-FR')} ${unit}`}
              onCommit={(v) => set({ radius: v })}
            />
          </PopoverContent>
        </Popover>
        <OptionSeparator />
        <OptionButton
          label={s.twoWay ? translate('map.portals.twoWay') : translate('map.portals.oneWay')}
          active={s.twoWay}
          onClick={() => set({ twoWay: !s.twoWay })}
        >
          <ArrowRightLeft />
        </OptionButton>
        <OptionButton
          label={s.auto ? translate('map.portals.autoHint') : translate('map.portals.onDemandHint')}
          active={s.auto}
          onClick={() => set({ auto: !s.auto })}
        >
          <Zap />
        </OptionButton>
        <OptionButton
          label={
            s.visible
              ? translate('map.portals.visibleToPlayers')
              : translate('map.portals.hiddenFromPlayers')
          }
          active={s.visible}
          onClick={() => set({ visible: !s.visible })}
        >
          {s.visible ? <Eye /> : <EyeOff />}
        </OptionButton>
      </div>
      <p className="max-w-[36rem] px-2 text-center text-[11px] leading-snug text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
