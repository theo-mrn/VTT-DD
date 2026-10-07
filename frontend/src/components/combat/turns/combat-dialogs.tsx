'use client';

/**
 * Fenêtres du combat en cours (MJ) : initiative de tous (paramètres par camp, seulement ceux
 * qui n'en ont pas), ajout de participants en cours de combat, fin du combat (rapports en
 * attente gardés ou écartés, états à durée retirés), réglages.
 */
import { useTranslations } from 'next-intl';
import type { ActionParams, CampaignSide, CombatSettings, CombatState } from '@vtt/contracts';
import type { SystemeCharge } from '@vtt/rules';
import { Dices, EyeOff, Flag, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { combatFailure, combatSettings, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { CheckBox } from '../check-box';
import { SIDE_LABELS, startCandidates } from './model';
import { SideParamsForm, initiativeAction, initiativeParams } from './initiative-form';
import { sideParamsBody } from './setup';
import { SettingsFields } from './start-combat';
import type { CastMember } from './use-cast';
import { useSceneTokens } from './use-scene-tokens';
import { DotsBackdrop } from '../backdrop';

async function attempt(label: string, work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (err) {
    {
      const message = combatFailure(err);
      if (message) toast.error(label, { description: message });
    }
    return false;
  }
}

// ─── Initiative de tous ──────────────────────────────────────────────────────

export function InitiativeDialog({
  open,
  onOpenChange,
  campaignId,
  combat,
  systeme,
  initial,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
  systeme: SystemeCharge | null;
  /** Choix par camp de l'en-tête, repris à l'ouverture. */
  initial?: Partial<Record<CampaignSide, ActionParams>>;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <InitiativeBody
          campaignId={campaignId}
          combat={combat}
          systeme={systeme}
          initial={initial ?? {}}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}

function InitiativeBody({
  onOpenChange,
  campaignId,
  combat,
  systeme,
  initial,
}: Readonly<{
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
  systeme: SystemeCharge | null;
  initial: Partial<Record<CampaignSide, ActionParams>>;
}>) {
  const t = useTranslations();
  const commands = useCombatCommands(campaignId);
  const [sideParams, setSideParams] =
    useState<Partial<Record<CampaignSide, ActionParams>>>(initial);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = initiativeAction(systeme);
  const parametres = initiativeParams(action);
  const sides = [...new Set(combat.order.map((p) => p.side))];
  const missing = combat.order.filter((p) => !p.sortKeys.length).map((p) => p.characterId);

  const roll = async () => {
    setBusy(true);
    const paramsBySide = sideParamsBody(sideParams);
    const ok = await attempt(t('combat.initiative.rollFailed'), () =>
      commands.rollInitiative({
        ...(paramsBySide ? { paramsBySide } : {}),
        ...(onlyMissing && missing.length ? { participants: missing } : {}),
      }),
    );
    setBusy(false);
    if (ok) {
      toast.success(t('combat.initiative.rolled'));
      onOpenChange(false);
    }
  };

  return (
    <DialogContent
      className="isolate sm:max-w-md"
      onInteractOutside={(e) => busy && e.preventDefault()}
      onEscapeKeyDown={(e) => busy && e.preventDefault()}
    >
      <DotsBackdrop />
      <DialogHeader>
        <DialogTitle>{t('combat.initiative.title')}</DialogTitle>
        <DialogDescription>
          {action
            ? t('combat.initiative.forEach', { action: action.nom })
            : t('combat.initiative.none')}
        </DialogDescription>
      </DialogHeader>
      {action && systeme && (
        <div className="space-y-4">
          <SideParamsForm
            systeme={systeme}
            parametres={parametres}
            sides={sides}
            value={sideParams}
            onChange={setSideParams}
            disabled={busy}
          />
          {combat.initiativeRolled && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="init-missing" className="text-[13px]">
                Seulement ceux qui n’en ont pas ({missing.length})
              </Label>
              <Switch
                id="init-missing"
                checked={onlyMissing}
                disabled={busy || !missing.length}
                onCheckedChange={setOnlyMissing}
              />
            </div>
          )}
        </div>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          {t('common.actions.cancel')}
        </Button>
        <Button onClick={() => void roll()} loading={busy} disabled={!action}>
          <Dices />
          {combat.initiativeRolled ? t('combat.initiative.reroll') : t('combat.initiative.roll')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Ajouter des participants ────────────────────────────────────────────────

export function AddParticipantsDialog({
  open,
  onOpenChange,
  campaignId,
  combat,
  members,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
  members: readonly CastMember[];
}>) {
  const t = useTranslations();
  const commands = useCombatCommands(campaignId);
  const { tokens } = useSceneTokens(campaignId);
  const inCombat = useMemo(() => new Set(combat.order.map((p) => p.characterId)), [combat.order]);
  const candidates = startCandidates(
    members
      .filter((m) => !inCombat.has(m.id))
      .map((m) => ({ characterId: m.id, side: m.side, inCreation: m.inCreation })),
    tokens,
  );
  const byId = new Map(members.map((m) => [m.id, m]));
  const [picked, setPicked] = useState<Record<string, { checked: boolean; hidden: boolean }>>({});
  const [roll, setRoll] = useState(combat.initiativeRolled);
  const [busy, setBusy] = useState(false);
  const rows = candidates.map((c) => ({ ...c, ...picked[c.characterId] }));
  const chosen = rows.filter((r) => r.checked);

  const add = async () => {
    if (!chosen.length) return;
    setBusy(true);
    const ok = await attempt(t('combat.add.failed'), () =>
      commands.addParticipants({
        participants: chosen.map((c) => ({
          characterId: c.characterId,
          ...(c.hidden ? { visibleToPlayers: false } : {}),
          initiative: roll ? 'roll' : 'none',
        })),
      }),
    );
    setBusy(false);
    if (ok) {
      setPicked({});
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="isolate sm:max-w-md">
        <DotsBackdrop />
        <DialogHeader>
          <DialogTitle>{t('combat.add.title')}</DialogTitle>
          <DialogDescription>
            Ils entrent à leur place d’initiative ; le tour ne change pas de main.
          </DialogDescription>
        </DialogHeader>
        {rows.length ? (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map((r) => {
              const m = byId.get(r.characterId);
              const name = m?.name ?? t('map.common.character');
              const set = (patch: Partial<{ checked: boolean; hidden: boolean }>) =>
                setPicked((prev) => ({
                  ...prev,
                  [r.characterId]: { checked: r.checked, hidden: r.hidden, ...patch },
                }));
              return (
                <li key={r.characterId} className="flex items-center gap-2.5 px-3 py-2">
                  <CheckBox
                    checked={r.checked}
                    onChange={(on) => set({ checked: on })}
                    label={`Ajouter ${name}`}
                  />
                  <Illustration
                    largeur={32}
                    src={m?.portraitUrl ?? null}
                    graine={name}
                    position="top"
                    className="size-8 rounded-full ring-1 ring-border"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {SIDE_LABELS[r.side].name}
                      {r.onScene ? ` · ${t('combat.onScene')}` : ''}
                    </span>
                  </span>
                  {r.side !== 'players' && (
                    <Button
                      type="button"
                      size="xs"
                      variant={r.hidden ? 'secondary' : 'ghost'}
                      aria-pressed={r.hidden}
                      disabled={!r.checked}
                      onClick={() => set({ hidden: !r.hidden })}
                    >
                      <EyeOff />
                      {r.hidden ? t('combat.hiddenShort') : t('combat.visible')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
            {t('combat.add.allIn')}
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="add-roll" className="text-[13px]">
            Tirer leur initiative
          </Label>
          <Switch id="add-roll" checked={roll} onCheckedChange={setRoll} disabled={busy} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
          <Button onClick={() => void add()} loading={busy} disabled={!chosen.length}>
            <UserPlus />
            Ajouter ({chosen.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Fin du combat ───────────────────────────────────────────────────────────

export function EndCombatDialog({
  open,
  onOpenChange,
  campaignId,
  combat,
  pendingReports,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
  pendingReports: number;
}>) {
  const t = useTranslations();
  const commands = useCombatCommands(campaignId);
  const [reports, setReports] = useState<'keep' | 'dismiss'>('keep');
  // Une durée de combat finit avec le combat (docs/combat.md § 18.6) ; décocher les garde
  const [clearTimed, setClearTimed] = useState(true);
  const [busy, setBusy] = useState(false);

  const end = async () => {
    setBusy(true);
    const ok = await attempt(t('combat.end.failed'), () =>
      commands.end({
        ...(pendingReports ? { pendingAttacks: reports } : {}),
        clearTimedStates: clearTimed,
      }),
    );
    setBusy(false);
    if (ok) {
      toast.success(
        combat.round > 1
          ? t('combat.end.doneAfter', { rounds: combat.round })
          : t('combat.end.done'),
      );
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="isolate sm:max-w-md">
        <DotsBackdrop />
        <DialogHeader>
          <DialogTitle>{t('combat.end.title')}</DialogTitle>
          <DialogDescription>
            {t('combat.end.summary', { round: combat.round, count: combat.order.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {pendingReports > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium">
                {t('combat.end.pendingReports', { count: pendingReports })}
              </legend>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['keep', t('combat.end.keep'), t('combat.end.keepHint')],
                    ['dismiss', t('combat.end.dismiss'), t('combat.end.dismissHint')],
                  ] as const
                ).map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={reports === value}
                    onClick={() => setReports(value)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                      reports === value
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border-strong hover:bg-surface-2',
                    )}
                  >
                    <span className="block text-[13px] font-medium">{label}</span>
                    <span className="block text-[11px] text-subtle">{hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="end-clear" className="text-[13px]">
              {t('combat.end.clearStates')}
            </Label>
            <Switch id="end-clear" checked={clearTimed} onCheckedChange={setClearTimed} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('combat.end.continue')}
          </Button>
          <Button variant="destructive" onClick={() => void end()} loading={busy}>
            <Flag />
            {t('combat.end.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Réglages ────────────────────────────────────────────────────────────────

export function SettingsDialog({
  open,
  onOpenChange,
  campaignId,
  combat,
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
}>) {
  const t = useTranslations();
  const commands = useCombatCommands(campaignId);
  const [busy, setBusy] = useState(false);
  const current = combatSettings(combat);
  const change = async (next: CombatSettings) => {
    const diff = (Object.keys(next) as (keyof CombatSettings)[]).filter(
      (k) => next[k] !== current[k],
    );
    if (!diff.length) return;
    setBusy(true);
    const body: Partial<CombatSettings> = {};
    for (const k of diff) body[k] = next[k];
    await attempt(t('combat.settingsDialog.failed'), () => commands.updateSettings(body));
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="isolate sm:max-w-md">
        <DotsBackdrop />
        <DialogHeader>
          <DialogTitle>{t('combat.settingsDialog.title')}</DialogTitle>
          <DialogDescription>{t('combat.settingsDialog.lead')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SettingsFields value={current} onChange={(v) => void change(v)} disabled={busy} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
