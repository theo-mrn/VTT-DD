'use client';

/**
 * Fenêtres du combat en cours (MJ) : initiative de tous (paramètres par camp, seulement ceux
 * qui n'en ont pas), ajout de participants en cours de combat, fin du combat (rapports en
 * attente gardés ou écartés, états à durée retirés), réglages.
 */
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
import { combatErrorMessage } from '@/lib/combat/api';
import { combatSettings, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { CheckBox } from '../check-box';
import { SIDE_LABELS, startCandidates } from './model';
import {
  SideParamsForm,
  initiativeAction,
  initiativeParams,
  sideParamsBody,
} from './initiative-form';
import { SettingsFields } from './start-combat';
import type { CastMember } from './use-cast';
import { useSceneTokens } from './use-scene-tokens';

async function attempt(label: string, work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (err) {
    toast.error(label, { description: combatErrorMessage(err) });
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
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
  systeme: SystemeCharge | null;
}) {
  const commands = useCombatCommands(campaignId);
  const [sideParams, setSideParams] = useState<Partial<Record<CampaignSide, ActionParams>>>({});
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const action = initiativeAction(systeme);
  const parametres = initiativeParams(action);
  const sides = [...new Set(combat.order.map((p) => p.side))];
  const missing = combat.order.filter((p) => !p.sortKeys.length).map((p) => p.characterId);

  const roll = async () => {
    setBusy(true);
    const paramsBySide = sideParamsBody(sideParams);
    const ok = await attempt('L’initiative n’a pas pu être lancée', () =>
      commands.rollInitiative({
        ...(paramsBySide ? { paramsBySide } : {}),
        ...(onlyMissing && missing.length ? { participants: missing } : {}),
      }),
    );
    setBusy(false);
    if (ok) {
      toast.success('Initiative lancée');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Initiative</DialogTitle>
          <DialogDescription>
            {action
              ? `« ${action.nom} » pour chaque participant ; l’ordre suit le résultat.`
              : 'Le système ne déclare pas d’initiative.'}
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
            Annuler
          </Button>
          <Button onClick={() => void roll()} loading={busy} disabled={!action}>
            <Dices />
            {combat.initiativeRolled ? 'Relancer' : 'Lancer l’initiative'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ajouter des participants ────────────────────────────────────────────────

export function AddParticipantsDialog({
  open,
  onOpenChange,
  campaignId,
  combat,
  members,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
  members: readonly CastMember[];
}) {
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
  const rows = candidates.map((c) => ({ ...c, ...(picked[c.characterId] ?? {}) }));
  const chosen = rows.filter((r) => r.checked);

  const add = async () => {
    if (!chosen.length) return;
    setBusy(true);
    const ok = await attempt('Les participants n’ont pas pu rejoindre le combat', () =>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter au combat</DialogTitle>
          <DialogDescription>
            Ils entrent à leur place d’initiative ; le tour ne change pas de main.
          </DialogDescription>
        </DialogHeader>
        {rows.length ? (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map((r) => {
              const m = byId.get(r.characterId);
              const name = m?.name ?? 'Personnage';
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
                    src={m?.portraitUrl ?? null}
                    graine={name}
                    position="top"
                    className="size-8 rounded-full ring-1 ring-border"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {SIDE_LABELS[r.side].name}
                      {r.onScene ? ' · sur la scène' : ''}
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
                      {r.hidden ? 'Caché' : 'Visible'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
            Tous les personnages engagés sont déjà au combat.
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
            Annuler
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
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
  pendingReports: number;
}) {
  const commands = useCombatCommands(campaignId);
  const [reports, setReports] = useState<'keep' | 'dismiss'>('keep');
  const [clearTimed, setClearTimed] = useState(false);
  const [busy, setBusy] = useState(false);

  const end = async () => {
    setBusy(true);
    const ok = await attempt('Le combat n’a pas pu se terminer', () =>
      commands.end({
        ...(pendingReports ? { pendingAttacks: reports } : {}),
        ...(clearTimed ? { clearTimedStates: true } : {}),
      }),
    );
    setBusy(false);
    if (ok) {
      toast.success(
        combat.round > 1 ? `Fin du combat après ${combat.round} rounds.` : 'Fin du combat.',
      );
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Terminer le combat ?</DialogTitle>
          <DialogDescription>
            Round {combat.round}, {combat.order.length} participant
            {combat.order.length > 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {pendingReports > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium">
                {pendingReports} rapport{pendingReports > 1 ? 's' : ''} en attente
              </legend>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['keep', 'Les garder', 'À décider plus tard'],
                    ['dismiss', 'Les écarter', 'Rien n’est appliqué'],
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
              Retirer les états à durée
            </Label>
            <Switch id="end-clear" checked={clearTimed} onCheckedChange={setClearTimed} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Continuer le combat
          </Button>
          <Button variant="destructive" onClick={() => void end()} loading={busy}>
            <Flag />
            Terminer
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
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  campaignId: string;
  combat: CombatState;
}) {
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
    await attempt('Les réglages n’ont pas pu changer', () => commands.updateSettings(body));
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Réglages du combat</DialogTitle>
          <DialogDescription>
            Ils valent pour toute la table, jusqu’à la fin du combat.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SettingsFields value={current} onChange={(v) => void change(v)} disabled={busy} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
