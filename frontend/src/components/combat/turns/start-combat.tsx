'use client';

/**
 * Réglages du combat (docs/combat.md § 9.2) : interrupteurs partagés par le démarrage et le
 * combat en cours ; hors combat, la fenêtre des réglages du prochain combat (mode des tours et
 * réglages, envoyés au démarrage s'ils s'écartent du défaut).
 */
import { useTranslations } from 'next-intl';
import type { CombatMode, CombatSettings } from '@vtt/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DotsBackdrop } from '../backdrop';

/** Réglages du combat ; nom et explication : `combat.settings.<réglage>.name|hint`. */
export const SETTINGS: readonly (keyof CombatSettings)[] = [
  'playersActOutsideTurn',
  'gmRollsHidden',
  'physicalDice',
];

/** Interrupteurs des réglages du combat (démarrage, ou en cours par le menu). */
export function SettingsFields({
  value,
  onChange,
  disabled,
}: Readonly<{
  value: CombatSettings;
  onChange(value: CombatSettings): void;
  disabled?: boolean;
}>) {
  const t = useTranslations();
  return (
    <>
      {SETTINGS.map((k) => (
        <div key={k} className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            <Label htmlFor={`setting-${k}`} className="text-[13px]">
              {t(`combat.settings.${k}.name`)}
            </Label>
            <span className="block text-[11px] text-subtle">{t(`combat.settings.${k}.hint`)}</span>
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
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Mode que déclare le système (`initiative.mode`), s'il en déclare un. */
  systemMode: CombatMode | null;
  /** Null : celui du système. */
  mode: CombatMode | null;
  onMode(mode: CombatMode | null): void;
  settings: CombatSettings;
  onSettings(settings: CombatSettings): void;
}>) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="isolate sm:max-w-md">
        <DotsBackdrop />
        <DialogHeader>
          <DialogTitle>{t('combat.start.title')}</DialogTitle>
          <DialogDescription>{t('combat.start.lead')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="start-mode" className="text-[13px]">
              {t('combat.start.turns')}
            </Label>
            <SelectField
              id="start-mode"
              value={mode ?? ''}
              onValueChange={(v) => onMode(v ? (v as CombatMode) : null)}
              className="w-56"
              options={[
                {
                  valeur: '',
                  nom: systemMode
                    ? t('combat.start.systemModeOf', {
                        mode: t(`combat.modes.${systemMode}`).toLowerCase(),
                      })
                    : t('combat.start.systemMode'),
                },
                { valeur: 'individual', nom: t('combat.modes.individual') },
                { valeur: 'slots', nom: t('combat.modes.slots') },
              ]}
            />
          </div>
          <SettingsFields value={settings} onChange={onSettings} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
