'use client';

/**
 * Réglages du combat (docs/combat.md § 9.2) : interrupteurs partagés par le démarrage et le
 * combat en cours ; hors combat, la fenêtre des réglages du prochain combat (mode des tours et
 * réglages, envoyés au démarrage s'ils s'écartent du défaut). La liste des raccourcis du
 * panneau a sa fenêtre ici aussi.
 */
import type { CombatMode, CombatSettings } from '@vtt/contracts';
import { Keyboard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { COMBAT_SHORTCUTS, type CombatShortcut } from './shortcuts';

export const MODE_LABELS: Record<CombatMode, string> = {
  individual: 'Individuel',
  slots: 'Créneaux par camp',
};

export const SETTING_LABELS: Record<keyof CombatSettings, { name: string; hint: string }> = {
  playersActOutsideTurn: {
    name: 'Attaques hors du tour',
    hint: 'Un joueur peut attaquer hors du tour de son personnage (réaction), marqué « hors tour ».',
  },
  gmRollsHidden: {
    name: 'Jets du MJ cachés',
    hint: 'Vos attaques sont cachées aux joueurs par défaut.',
  },
  physicalDice: {
    name: 'Dés 3D',
    hint: 'Les dés roulent à l’écran ; coupé : le serveur tire tous les dés du combat.',
  },
};

/** Interrupteurs des réglages du combat (démarrage, ou en cours par le menu). */
export function SettingsFields({
  value,
  onChange,
  disabled,
}: {
  value: CombatSettings;
  onChange(value: CombatSettings): void;
  disabled?: boolean;
}) {
  return (
    <>
      {(Object.keys(SETTING_LABELS) as (keyof CombatSettings)[]).map((k) => (
        <div key={k} className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <Label htmlFor={`setting-${k}`} className="text-[13px]">
              {SETTING_LABELS[k].name}
            </Label>
            <span className="block text-[11px] text-subtle">{SETTING_LABELS[k].hint}</span>
          </span>
          <Switch
            id={`setting-${k}`}
            disabled={disabled}
            checked={value[k]}
            onCheckedChange={(on) => onChange({ ...value, [k]: on })}
          />
        </div>
      ))}
    </>
  );
}

/** Hors combat : mode des tours et réglages du prochain combat. */
export function StartSettingsDialog({
  open,
  onOpenChange,
  systemMode,
  mode,
  onMode,
  settings,
  onSettings,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Mode que déclare le système (`initiative.mode`), s'il en déclare un. */
  systemMode: CombatMode | null;
  /** Null : celui du système. */
  mode: CombatMode | null;
  onMode(mode: CombatMode | null): void;
  settings: CombatSettings;
  onSettings(settings: CombatSettings): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Réglages du prochain combat</DialogTitle>
          <DialogDescription>
            Envoyés au démarrage ; modifiables ensuite pendant le combat.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="start-mode" className="text-[13px]">
              Tours
            </Label>
            <SelectField
              id="start-mode"
              value={mode ?? ''}
              onValueChange={(v) => onMode(v ? (v as CombatMode) : null)}
              className="w-56"
              options={[
                {
                  valeur: '',
                  nom: `Selon le système${systemMode ? ` (${MODE_LABELS[systemMode].toLowerCase()})` : ''}`,
                },
                { valeur: 'individual', nom: MODE_LABELS.individual },
                { valeur: 'slots', nom: MODE_LABELS.slots },
              ]}
            />
          </div>
          <SettingsFields value={settings} onChange={onSettings} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Raccourcis clavier du panneau. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-4 text-primary" aria-hidden />
            Raccourcis du panneau Combat
          </DialogTitle>
          <DialogDescription>
            Quand le panneau est ouvert et qu’aucun champ n’est en cours de saisie.
          </DialogDescription>
        </DialogHeader>
        <dl className="space-y-2">
          {(Object.keys(COMBAT_SHORTCUTS) as CombatShortcut[]).map((k) => (
            <div key={k} className="flex items-center justify-between gap-4 text-[13px]">
              <dt>{COMBAT_SHORTCUTS[k].name}</dt>
              <dd>
                <Kbd>{COMBAT_SHORTCUTS[k].label}</Kbd>
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 text-[13px]">
            <dt>Ouvrir ou fermer le panneau</dt>
            <dd>
              <Kbd>M</Kbd>
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
