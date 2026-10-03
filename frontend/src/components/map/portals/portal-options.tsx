'use client';

/**
 * Barre contextuelle de l'outil portails (X) : réglages des portails posés (icône, couleur,
 * rayon, aller-retour, automatique, visible des joueurs), gardés dans le navigateur, et rappel
 * des gestes selon l'étape (entrée, arrivée, choix d'une arrivée).
 */
import { ArrowRightLeft, Eye, EyeOff, Palette, Zap } from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { PORTAL_COLORS, PORTAL_ICONS, RADIUS_RANGE } from '@/lib/map/modules/portals/model';
import { PortalTool } from '@/lib/map/modules/portals/tool';
import { OptionButton, OptionSeparator, RangeField, Swatches } from '../obstacles/controls';
import { PortalGlyph } from './portal-glyph';

export function PortalOptions({ engine }: Readonly<{ engine: MapEngine }>) {
  const tool = engine.tools.active;
  if (!(tool instanceof PortalTool)) return null;
  return <Options engine={engine} tool={tool} />;
}

const HINTS = {
  idle: 'Clic : poser l’entrée d’un portail, puis son arrivée (Alt : sans aimantation). Glisser un portail le déplace ; ses poignées règlent la zone et l’arrivée.',
  destination:
    'Cliquez l’arrivée sur la carte, ou choisissez une autre scène dans le panneau « Destination ». Échap : annuler.',
  pick: 'Cliquez la nouvelle arrivée du portail sur la carte. Échap : annuler.',
} as const;

function Options({ engine, tool }: Readonly<{ engine: MapEngine; tool: PortalTool }>) {
  const s = useStore(tool.settings);
  const state = useStore(tool.ui, (u) => u.state);
  const set = tool.settings.setState;
  const unit = engine.kindContext().unitName;
  const hint =
    state === 'destination' ? HINTS.destination : state === 'pick' ? HINTS.pick : HINTS.idle;

  return (
    <div className="flex max-w-full flex-col items-center gap-1">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        <span className="px-1 text-xs text-muted-foreground">Nouveau portail</span>
        {PORTAL_ICONS.map((i) => (
          <OptionButton
            key={i.value}
            label={i.label}
            active={s.icon === i.value}
            onClick={() => set({ icon: i.value })}
          >
            <PortalGlyph icon={i.value} />
          </OptionButton>
        ))}
        <OptionSeparator />
        <Popover>
          <Info texte="Couleur et zone">
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 px-2"
                aria-label="Couleur et zone"
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
              options={PORTAL_COLORS}
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
          label={s.twoWay ? 'Aller-retour : le retour est posé à l’arrivée' : 'Aller simple'}
          active={s.twoWay}
          onClick={() => set({ twoWay: !s.twoWay })}
        >
          <ArrowRightLeft />
        </OptionButton>
        <OptionButton
          label={
            s.auto
              ? 'Automatique : franchi dès qu’un joueur y lâche son token'
              : 'Sur demande : le joueur choisit de l’emprunter'
          }
          active={s.auto}
          onClick={() => set({ auto: !s.auto })}
        >
          <Zap />
        </OptionButton>
        <OptionButton
          label={s.visible ? 'Visible des joueurs' : 'Masqué aux joueurs'}
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
