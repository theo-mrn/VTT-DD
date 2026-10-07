'use client';

/**
 * Hors combat, « Combat » de la barre du MJ (docs/combat.md § 12.6) : la préparation du
 * combat. Les personnages de la scène déjà cochés (`SetupList` : case pour écarter, cacher,
 * surpris), la compétence d'initiative par camp (Star Wars), mode et réglages ; « Lancer
 * l'initiative » démarre et tire l'ordre, « Démarrer sans initiative » démarre seulement.
 */
import { useTranslations } from 'next-intl';
import {
  DEFAULT_COMBAT_SETTINGS,
  type ActionParams,
  type CampaignSide,
  type CombatMode,
  type CombatSettings,
} from '@vtt/contracts';
import type { SystemeCharge } from '@vtt/rules';
import { Dices, Loader2, Play, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/select';
import { Info } from '@/components/ui/tooltip';
import type { DetailCampagne } from '@/lib/campagnes';
import { combatFailure, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { CTA, TOUCH } from '../live-reports/look';
import {
  entryOptionsOf,
  initiativeAction,
  sideChoiceParam,
  type Parametre,
} from '../turns/initiative-form';
import { SIDE_LABELS, startCandidates } from '../turns/model';
import {
  pruneChoices,
  setupRows,
  setupSummary,
  startCombatBody,
  withChoice,
  type SetupChoices,
} from '../turns/setup';
import { SetupList } from '../turns/setup-list';
import { StartSettingsDialog } from '../turns/start-combat';
import { systemInitiativeMode, useCast, useParticipantSheets } from '../turns/use-cast';
import { useSceneTokens } from '../turns/use-scene-tokens';
import { DotsBackdrop } from '../backdrop';

export function StartCombatDialog({
  open,
  onOpenChange,
  campagne,
  onConsult,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  campagne: DetailCampagne;
  /** Clic sur une ligne : la fiche de ce personnage. */
  onConsult(characterId: string): void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="isolate flex max-h-[min(88dvh,46rem)] flex-col gap-0 p-0 sm:max-w-xl">
        <DotsBackdrop />
        {open && (
          <StartBody
            campagne={campagne}
            onConsult={onConsult}
            onStarted={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StartBody({
  campagne,
  onConsult,
  onStarted,
}: Readonly<{
  campagne: DetailCampagne;
  onConsult(characterId: string): void;
  onStarted(): void;
}>) {
  const t = useTranslations();
  const campaignId = campagne.id;
  const cast = useCast(campaignId);
  const commands = useCombatCommands(campaignId);
  const { engine, tokens } = useSceneTokens(campaignId);
  // Les tokens bougent à chaque pas : seuls les personnages posés et leur visibilité comptent
  const sceneKey = tokens.map((t) => `${t.characterId}:${t.visibility}`).join('|');
  const candidates = useMemo(
    () =>
      startCandidates(
        cast.members.map((m) => ({ characterId: m.id, side: m.side, inCreation: m.inCreation })),
        tokens,
      ),
    // `sceneKey` résume `tokens`
    [cast.members, sceneKey],
  );
  const [choices, setChoices] = useState<SetupChoices>({});
  useEffect(() => setChoices((c) => pruneChoices(c, candidates)), [candidates]);
  const rows = setupRows(candidates, choices);
  const summary = setupSummary(rows);
  const [mode, setMode] = useState<CombatMode | null>(null);
  const [settings, setSettings] = useState<CombatSettings>(DEFAULT_COMBAT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<boolean | null>(null);

  const shownIds = rows.filter((r) => r.onScene || r.checked).map((r) => r.characterId);
  const { sheets, systeme } = useParticipantSheets(campaignId, campagne.system, shownIds);
  const action = initiativeAction(systeme);
  const choiceParam = sideChoiceParam(action);
  const [sideParams, setSideParams] = useState<Partial<Record<CampaignSide, ActionParams>>>({});

  const start = async (roll: boolean) => {
    const body = startCombatBody(rows, {
      rollInitiative: roll,
      mode,
      settings,
      sideParams,
    });
    if (!body || busy !== null) return;
    setBusy(roll);
    try {
      await commands.start(body);
      toast.success(t('history.lines.combatStarts'));
      onStarted();
    } catch (err) {
      const message = combatFailure(err);
      if (message) toast.error(t('combat.start.failed'), { description: message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="border-b border-border px-5 py-4 pr-12">
        <DialogTitle className="font-display text-lg">{t('combat.bar.combat')}</DialogTitle>
        <DialogDescription className="sr-only">{t('combat.start.lead2')}</DialogDescription>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <SetupList
          rows={rows}
          cast={cast.byId}
          sheets={sheets}
          loading={cast.isLoading}
          onMap={Boolean(engine)}
          consulted={null}
          onChange={(row, patch) => setChoices((c) => withChoice(c, row, patch))}
          onConsult={onConsult}
          onAll={(on) =>
            setChoices((c) =>
              rows.reduce((acc, r) => withChoice(acc, r, { checked: on }), { ...c }),
            )
          }
        />
      </div>

      <footer className="flex flex-wrap items-end gap-2 border-t border-border p-3">
        <Info texte={t('combat.start.modeSettings')}>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('size-10 rounded-[14px]', TOUCH)}
            aria-label={t('combat.start.modeSettings')}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
          </Button>
        </Info>
        {choiceParam && systeme && summary.sides.length > 0 && (
          <SideSelects
            param={choiceParam}
            systeme={systeme}
            sides={summary.sides}
            value={sideParams}
            onChange={setSideParams}
          />
        )}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-10 rounded-[14px] px-3.5', TOUCH)}
          onClick={() => void start(false)}
          disabled={busy !== null || !summary.chosen}
          aria-busy={busy === false || undefined}
        >
          {busy === false ? <Loader2 className="animate-spin" /> : <Play />}
          {t('combat.start.noInitiative')}
        </Button>
        {action && (
          <Button
            size="sm"
            className={cn(CTA, 'h-10 rounded-[14px] px-4')}
            onClick={() => void start(true)}
            disabled={busy !== null || !summary.chosen}
            aria-busy={busy === true || undefined}
          >
            {busy === true ? <Loader2 className="animate-spin" /> : <Dices />}
            {t('combat.initiative.roll')}
          </Button>
        )}
      </footer>

      <StartSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        systemMode={systemInitiativeMode(systeme)}
        mode={mode}
        onMode={setMode}
        settings={settings}
        onSettings={setSettings}
      />
    </>
  );
}

/** Compétence (ou autre choix) d'initiative par camp : une liste par camp présent. */
function SideSelects({
  param,
  systeme,
  sides,
  value,
  onChange,
}: Readonly<{
  param: Parametre;
  systeme: SystemeCharge;
  sides: readonly CampaignSide[];
  value: Partial<Record<CampaignSide, ActionParams>>;
  onChange(value: Partial<Record<CampaignSide, ActionParams>>): void;
}>) {
  const t = useTranslations();
  const options = [
    { valeur: '', nom: t('combat.initiative.default') },
    ...entryOptionsOf(systeme, param),
  ];
  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label={param.nom}>
      {sides.map((side) => {
        const current = value[side]?.[param.id];
        return (
          <label key={side} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
              {SIDE_LABELS[side].name}
            </span>
            <SelectField
              value={typeof current === 'string' ? current : ''}
              onValueChange={(v) => {
                const params = { ...value[side] };
                if (v) params[param.id] = v;
                else delete params[param.id];
                onChange({ ...value, [side]: params });
              }}
              options={options}
              className="h-10 w-36 rounded-[14px] text-xs"
              aria-label={t('combat.start.paramOf', {
                param: param.nom,
                side: SIDE_LABELS[side].name.toLowerCase(),
              })}
            />
          </label>
        );
      })}
    </div>
  );
}
